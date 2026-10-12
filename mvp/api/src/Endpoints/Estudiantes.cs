using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record EstudianteRequest(
    string Rut, string Nombre, string Apellido, DateOnly? FechaNacimiento, int? CursoId,
    string? Diagnostico, int? NivelTea, TipoPie TipoPie, string? Apoyos,
    string? NombreApoderado, string? TelefonoApoderado, string? EmailApoderado, string? Observaciones);

public static class EstudiantesEndpoints
{
    // Estudiantes de los cursos del profesor, más los que aún no tienen curso.
    private static IQueryable<Estudiante> Visibles(AppDb db, ClaimsPrincipal user)
    {
        var profeId = user.ProfesorId();
        return db.Estudiantes.Where(e => e.CursoId == null || e.Curso!.ProfesorId == profeId);
    }

    public static void MapEstudiantes(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estudiantes").RequireAuthorization();

        g.MapGet("/", async (int? cursoId, string? q, string? pie, ClaimsPrincipal user, AppDb db) =>
        {
            var query = Visibles(db, user);
            if (cursoId is not null) query = query.Where(e => e.CursoId == cursoId);
            if (pie == "si") query = query.Where(e => e.TipoPie != TipoPie.Ninguno);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var t = q.Trim();
                query = query.Where(e => EF.Functions.ILike(e.Nombre + " " + e.Apellido, $"%{t}%") || e.Rut.Contains(t));
            }
            return await query.OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new
                {
                    e.Id, e.Rut, e.Nombre, e.Apellido, e.FechaNacimiento, e.CursoId,
                    Curso = e.Curso == null ? null : e.Curso.Nivel.Nombre + " " + e.Curso.Letra,
                    e.Diagnostico, e.NivelTea, TipoPie = e.TipoPie.ToString(), e.Apoyos,
                    e.NombreApoderado, e.TelefonoApoderado, e.EmailApoderado, e.Observaciones,
                    Exclusiones = db.Exclusiones.Count(x => x.EstudianteId == e.Id),
                })
                .ToListAsync();
        });

        // Ficha del estudiante: datos, adecuaciones, evaluaciones rendidas y logro por OA.
        g.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await Visibles(db, user).Include(x => x.Curso).ThenInclude(c => c!.Nivel).SingleOrDefaultAsync(x => x.Id == id);
            if (e is null) return Results.NotFound();

            var exclusiones = await db.Exclusiones.Where(x => x.EstudianteId == id)
                .Join(db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel), x => x.ObjetivoId, o => o.Id, (x, o) => o)
                .ToListAsync();
            var intentos = await db.Intentos.Where(i => i.EstudianteId == id && !i.EsPrueba)
                .OrderByDescending(i => i.IniciadoEn)
                .Select(i => new
                {
                    i.Id, i.EvaluacionId, i.Evaluacion.Titulo, Tipo = i.Evaluacion.Tipo.ToString(), Asignatura = i.Evaluacion.Asignatura.Nombre,
                    i.Evaluacion.CursoId, i.EntregadoEn, i.PuntajeObtenido, i.PuntajeMaximo, i.Nota, i.RevisionPendiente,
                    Ayudas = i.Mensajes.Count(m => m.Rol == "metis" && m.NivelAyuda != null),
                })
                .ToListAsync();
            var logro = await Logro.PorOaAsync(db, estudianteId: id);
            var oasLogro = await db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel)
                .Where(o => logro.Keys.Contains(o.Id)).ToListAsync();

            return Results.Ok(new
            {
                e.Id, e.Rut, e.Nombre, e.Apellido, e.FechaNacimiento, e.CursoId,
                Curso = e.Curso is null ? null : Dtos.NombreCurso(e.Curso),
                e.Diagnostico, e.NivelTea, TipoPie = e.TipoPie.ToString(), e.Apoyos,
                e.NombreApoderado, e.TelefonoApoderado, e.EmailApoderado, e.Observaciones,
                Exclusiones = exclusiones.Select(Dtos.Oa),
                Evaluaciones = intentos,
                Logro = oasLogro.OrderBy(o => o.Asignatura.Nombre).ThenBy(o => o.Numero)
                    .Select(o => new { Oa = Dtos.Oa(o), logro[o.Id].Porcentaje, logro[o.Id].Nivel }),
            });
        });

        g.MapPost("/", async (EstudianteRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var (rut, error) = await Validar(req, null, user, db);
            if (error is not null) return error;
            var e = new Estudiante { Rut = rut!, Nombre = req.Nombre.Trim(), Apellido = req.Apellido.Trim() };
            Aplicar(e, req);
            db.Estudiantes.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/api/estudiantes/{e.Id}", new { e.Id });
        });

        g.MapPut("/{id:int}", async (int id, EstudianteRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await Visibles(db, user).SingleOrDefaultAsync(x => x.Id == id);
            if (e is null) return Results.NotFound();
            var (rut, error) = await Validar(req, id, user, db);
            if (error is not null) return error;
            if (e.CursoId != req.CursoId)
                await db.Exclusiones.Where(x => x.EstudianteId == id).ExecuteDeleteAsync();
            e.Rut = rut!; e.Nombre = req.Nombre.Trim(); e.Apellido = req.Apellido.Trim();
            Aplicar(e, req);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await Visibles(db, user).Where(e => e.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static string? Limpio(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static void Aplicar(Estudiante e, EstudianteRequest req)
    {
        e.FechaNacimiento = req.FechaNacimiento;
        e.CursoId = req.CursoId;
        e.Diagnostico = Limpio(req.Diagnostico);
        e.NivelTea = e.Diagnostico == "TEA" ? req.NivelTea : null;
        e.TipoPie = req.TipoPie;
        e.Apoyos = Limpio(req.Apoyos);
        e.NombreApoderado = Limpio(req.NombreApoderado);
        e.TelefonoApoderado = Limpio(req.TelefonoApoderado);
        e.EmailApoderado = Limpio(req.EmailApoderado);
        e.Observaciones = Limpio(req.Observaciones);
    }

    private static async Task<(string? Rut, IResult? Error)> Validar(EstudianteRequest req, int? id, ClaimsPrincipal user, AppDb db)
    {
        var rut = Rut.Normalizar(req.Rut);
        if (rut is null) return (null, Results.Problem("RUT inválido: revisa el dígito verificador", statusCode: 400));
        if (string.IsNullOrWhiteSpace(req.Nombre) || string.IsNullOrWhiteSpace(req.Apellido))
            return (null, Results.Problem("Nombre y apellido son obligatorios", statusCode: 400));
        if (req.NivelTea is not null and not (1 or 2 or 3))
            return (null, Results.Problem("El nivel TEA debe ser 1, 2 o 3", statusCode: 400));
        if (req.CursoId is not null && await db.CursoPropio(req.CursoId.Value, user) is null)
            return (null, Results.Problem("Curso inválido", statusCode: 400));
        if (await db.Estudiantes.AnyAsync(e => e.Rut == rut && e.Id != id))
            return (null, Results.Problem("Ya existe un estudiante con ese RUT", statusCode: 409));
        return (rut, null);
    }
}
