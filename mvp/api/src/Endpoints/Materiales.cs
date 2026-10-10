using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
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
            if (await Validar(req, user, db) is { } error) return error;
            m.Titulo = req.Titulo.Trim();
            await Aplicar(m, req, db);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await Visibles(db, user).Where(m => m.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static async Task<IResult?> Validar(MaterialRequest req, ClaimsPrincipal user, AppDb db)
    {
        if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
        if (string.IsNullOrWhiteSpace(req.Contenido) && string.IsNullOrWhiteSpace(req.Url))
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
