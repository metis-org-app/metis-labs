using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Domain.Ia;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record MaterialRequest(
    string Titulo, TipoMaterial Tipo, int AsignaturaId, int NivelId, int? CursoId, string? Descripcion,
    string? Contenido, string? Url, bool LecturaFacil, List<int> ObjetivoIds);

public static class MaterialesEndpoints
{
    public static void MapMateriales(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/materiales").RequireAuthorization();

        // Biblioteca compartida + materiales de los cursos del profesor.
        IQueryable<Material> Visibles(AppDb db, ClaimsPrincipal user)
        {
            var profeId = user.ProfesorId();
            return db.Materiales.Where(m => m.CursoId == null || m.Curso!.ProfesorId == profeId);
        }

        object Dto(Material m, bool conContenido) => new
        {
            m.Id, m.Titulo, Tipo = m.Tipo.ToString(), m.AsignaturaId, Asignatura = m.Asignatura.Nombre, AsignaturaColor = m.Asignatura.Color,
            m.NivelId, Nivel = m.Nivel.Nombre, m.CursoId, Curso = m.Curso is null ? null : Dtos.NombreCurso(m.Curso),
            m.Descripcion, Contenido = conContenido ? m.Contenido : null, m.Url, m.LecturaFacil, m.CreadoEn,
            m.ArchivoNombre, m.ArchivoTipo, m.ArchivoTamano,
            Objetivos = m.Objetivos.OrderBy(o => o.Numero).Select(Dtos.Oa),
        };

        IQueryable<Material> ConDetalle(IQueryable<Material> q) => q
            .Include(m => m.Asignatura).Include(m => m.Nivel).Include(m => m.Curso).ThenInclude(c => c!.Nivel)
            .Include(m => m.Objetivos).ThenInclude(o => o.Asignatura)
            .Include(m => m.Objetivos).ThenInclude(o => o.Nivel);

        // cursoId: materiales de ese curso + los de la biblioteca que sirven a sus OA o a su nivel.
        g.MapGet("/", async (int? cursoId, int? asignaturaId, int? nivelId, int? oaId, string? tipo, string? q, ClaimsPrincipal user, AppDb db) =>
        {
            var query = Visibles(db, user);
            if (cursoId is not null)
            {
                var curso = await db.CursoPropio(cursoId.Value, user);
                if (curso is null) return Results.NotFound();
                var oasCurso = await db.CursoObjetivos.Where(c => c.CursoId == cursoId).Select(c => c.ObjetivoId).ToListAsync();
                query = query.Where(m => m.CursoId == cursoId
                    || (m.CursoId == null && (m.NivelId == curso.NivelId || m.Objetivos.Any(o => oasCurso.Contains(o.Id)))));
            }
            if (asignaturaId is not null) query = query.Where(m => m.AsignaturaId == asignaturaId);
            if (nivelId is not null) query = query.Where(m => m.NivelId == nivelId);
            if (oaId is not null) query = query.Where(m => m.Objetivos.Any(o => o.Id == oaId));
            if (Enum.TryParse<TipoMaterial>(tipo, out var t)) query = query.Where(m => m.Tipo == t);
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(m => EF.Functions.ILike(m.Titulo, $"%{q.Trim()}%") || (m.Descripcion != null && EF.Functions.ILike(m.Descripcion, $"%{q.Trim()}%")));
            var lista = await ConDetalle(query).OrderBy(m => m.Nivel.Orden).ThenBy(m => m.Asignatura.Nombre).ThenBy(m => m.Titulo).ToListAsync();
            return Results.Ok(lista.Select(m => Dto(m, false)));
        });

        g.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var m = await ConDetalle(Visibles(db, user)).SingleOrDefaultAsync(x => x.Id == id);
            return m is null ? Results.NotFound() : Results.Ok(Dto(m, true));
        });

        g.MapPost("/", async (MaterialRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await Validar(req, user, db) is { } error) return error;
            var m = new Material { Titulo = req.Titulo.Trim() };
            await Aplicar(m, req, db);
            db.Materiales.Add(m);
            await db.SaveChangesAsync();
            return Results.Created($"/api/materiales/{m.Id}", new { m.Id });
        });

        g.MapPut("/{id:int}", async (int id, MaterialRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var m = await Visibles(db, user).Include(x => x.Objetivos).SingleOrDefaultAsync(x => x.Id == id);
            if (m is null) return Results.NotFound();
            if (await Validar(req, user, db, conArchivo: m.ArchivoNombre is not null) is { } error) return error;
            m.Titulo = req.Titulo.Trim();
            await Aplicar(m, req, db);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Subir un archivo (PDF, Word, PowerPoint o texto) como material: sirve de fuente para generar evaluaciones con IA.
        g.MapPost("/archivo", async (HttpRequest http, ClaimsPrincipal user, AppDb db) =>
        {
            if (!http.HasFormContentType) return Results.Problem("Envía el archivo como formulario", statusCode: 400);
            var form = await http.ReadFormAsync();
            var archivo = form.Files.GetFile("archivo");
            if (archivo is null || archivo.Length == 0) return Results.Problem("Adjunta un archivo", statusCode: 400);
            if (archivo.Length > LectorArchivos.TamanoMaximo) return Results.Problem("El archivo supera los 15 MB", statusCode: 400);
            var ext = Path.GetExtension(archivo.FileName);
            if (!LectorArchivos.Tipos.TryGetValue(ext, out var tipo))
                return Results.Problem("Formato no soportado. Usa PDF, Word (.docx), PowerPoint (.pptx) o texto (.txt, .md, .csv)", statusCode: 400);
            if (!int.TryParse(form["asignaturaId"], out var asignaturaId) || !int.TryParse(form["nivelId"], out var nivelId)
                || !await db.Asignaturas.AnyAsync(a => a.Id == asignaturaId) || !await db.Niveles.AnyAsync(n => n.Id == nivelId))
                return Results.Problem("Asignatura o nivel inválido", statusCode: 400);
            int? cursoId = int.TryParse(form["cursoId"], out var c) ? c : null;
            if (cursoId is not null && await db.CursoPropio(cursoId.Value, user) is null) return Results.Problem("Curso inválido", statusCode: 400);

            using var ms = new MemoryStream();
            await archivo.CopyToAsync(ms);
            var datos = ms.ToArray();
            string? texto;
            try { texto = LectorArchivos.ExtraerTexto(archivo.FileName, datos); }
            catch (Exception) { return Results.Problem("No pudimos leer el archivo. Revisa que no esté dañado o protegido.", statusCode: 400); }
            if (!LectorArchivos.EsPdf(tipo) && string.IsNullOrWhiteSpace(texto)) return Results.Problem("El archivo no tiene texto que podamos leer", statusCode: 400);

            var titulo = form["titulo"].ToString() is { Length: > 0 } t ? t.Trim() : Path.GetFileNameWithoutExtension(archivo.FileName);
            var m = new Material
            {
                Titulo = titulo, Tipo = TipoMaterial.Documento, AsignaturaId = asignaturaId, NivelId = nivelId, CursoId = cursoId,
                Descripcion = $"Archivo subido: {archivo.FileName}", Contenido = texto,
                ArchivoNombre = archivo.FileName, ArchivoTipo = tipo, ArchivoTamano = archivo.Length,
                Archivo = new MaterialArchivo { Datos = datos },
            };
            db.Materiales.Add(m);
            await db.SaveChangesAsync();
            return Results.Created($"/api/materiales/{m.Id}", new { m.Id, m.Titulo, m.ArchivoNombre, m.ArchivoTipo, m.ArchivoTamano });
        }).DisableAntiforgery();

        g.MapGet("/{id:int}/archivo", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var m = await Visibles(db, user).Include(x => x.Archivo).SingleOrDefaultAsync(x => x.Id == id);
            return m?.Archivo is null ? Results.NotFound() : Results.File(m.Archivo.Datos, m.ArchivoTipo ?? "application/octet-stream", m.ArchivoNombre);
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await Visibles(db, user).Where(m => m.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static async Task<IResult?> Validar(MaterialRequest req, ClaimsPrincipal user, AppDb db, bool conArchivo = false)
    {
        if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
        if (!conArchivo && string.IsNullOrWhiteSpace(req.Contenido) && string.IsNullOrWhiteSpace(req.Url))
            return Results.Problem("Agrega el contenido del material o un enlace", statusCode: 400);
        if (!string.IsNullOrWhiteSpace(req.Url) && !(Uri.TryCreate(req.Url.Trim(), UriKind.Absolute, out var u) && u.Scheme is "http" or "https"))
            return Results.Problem("El enlace debe comenzar con http:// o https://", statusCode: 400);
        if (!await db.Asignaturas.AnyAsync(a => a.Id == req.AsignaturaId) || !await db.Niveles.AnyAsync(n => n.Id == req.NivelId))
            return Results.Problem("Asignatura o nivel inválido", statusCode: 400);
        if (req.CursoId is not null && await db.CursoPropio(req.CursoId.Value, user) is null)
            return Results.Problem("Curso inválido", statusCode: 400);
        return null;
    }

    private static async Task Aplicar(Material m, MaterialRequest req, AppDb db)
    {
        m.Tipo = req.Tipo;
        m.AsignaturaId = req.AsignaturaId;
        m.NivelId = req.NivelId;
        m.CursoId = req.CursoId;
        m.Descripcion = string.IsNullOrWhiteSpace(req.Descripcion) ? null : req.Descripcion.Trim();
        m.Contenido = string.IsNullOrWhiteSpace(req.Contenido) ? null : req.Contenido.Trim();
        m.Url = string.IsNullOrWhiteSpace(req.Url) ? null : req.Url.Trim();
        m.LecturaFacil = req.LecturaFacil;
        m.Objetivos = await db.Objetivos.Where(o => req.ObjetivoIds.Contains(o.Id)).ToListAsync();
    }
}
