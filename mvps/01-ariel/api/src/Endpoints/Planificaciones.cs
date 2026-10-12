using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record PlanificacionRequest(int CursoId, DateOnly SemanaInicio, string Titulo, string? Actividades, string? Adecuaciones, List<int> ObjetivoIds);

public static class PlanificacionesEndpoints
{
    public static void MapPlanificaciones(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/planificaciones").RequireAuthorization();

        g.MapGet("/", async (int cursoId, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(cursoId, user) is null) return Results.NotFound();
            var lista = (await db.Planificaciones.Where(p => p.CursoId == cursoId)
                .Include(p => p.Objetivos).ThenInclude(o => o.Asignatura)
                .Include(p => p.Objetivos).ThenInclude(o => o.Nivel)
                .OrderBy(p => p.SemanaInicio).ToListAsync())
                .Select(p => new
                {
                    p.Id, p.CursoId, p.SemanaInicio, p.Titulo, p.Actividades, p.Adecuaciones,
                    Objetivos = p.Objetivos.OrderBy(o => o.Asignatura.Nombre).ThenBy(o => o.Numero).Select(Dtos.Oa),
                });
            return Results.Ok(lista);
        });

        g.MapPost("/", async (PlanificacionRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await Validar(req, user, db) is { } error) return error;
            var p = new Planificacion { CursoId = req.CursoId, Titulo = req.Titulo.Trim() };
            await Aplicar(p, req, db);
            db.Planificaciones.Add(p);
            await db.SaveChangesAsync();
            return Results.Created($"/api/planificaciones/{p.Id}", new { p.Id });
        });

        g.MapPut("/{id:int}", async (int id, PlanificacionRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var p = await db.Planificaciones.Include(x => x.Objetivos)
                .SingleOrDefaultAsync(x => x.Id == id && x.Curso.ProfesorId == user.ProfesorId());
            if (p is null) return Results.NotFound();
            if (await Validar(req, user, db) is { } error) return error;
            p.CursoId = req.CursoId; p.Titulo = req.Titulo.Trim();
            await Aplicar(p, req, db);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await db.Planificaciones.Where(p => p.Id == id && p.Curso.ProfesorId == user.ProfesorId()).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static async Task<IResult?> Validar(PlanificacionRequest req, ClaimsPrincipal user, AppDb db)
    {
        if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
        if (await db.CursoPropio(req.CursoId, user) is null) return Results.Problem("Curso inválido", statusCode: 400);
        return null;
    }

    private static async Task Aplicar(Planificacion p, PlanificacionRequest req, AppDb db)
    {
        // Lunes de la semana elegida.
        var offset = ((int)req.SemanaInicio.DayOfWeek + 6) % 7;
        p.SemanaInicio = req.SemanaInicio.AddDays(-offset);
        p.Actividades = req.Actividades?.Trim();
        p.Adecuaciones = req.Adecuaciones?.Trim();
        // Solo OAs asignados al curso.
        var ids = await db.CursoObjetivos.Where(c => c.CursoId == req.CursoId && req.ObjetivoIds.Contains(c.ObjetivoId))
            .Select(c => c.ObjetivoId).ToListAsync();
        p.Objetivos = await db.Objetivos.Where(o => ids.Contains(o.Id)).ToListAsync();
    }
}
