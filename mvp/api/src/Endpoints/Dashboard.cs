using System.Security.Claims;
using MetisCurriculum.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboard(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/dashboard", async (ClaimsPrincipal user, AppDb db) =>
        {
            var profeId = user.ProfesorId();
            var cursos = db.Cursos.Where(c => c.ProfesorId == profeId);
            var estudiantes = db.Estudiantes.Where(e => e.Curso != null && e.Curso.ProfesorId == profeId);

            return new
            {
                Cursos = await cursos.CountAsync(),
                Estudiantes = await estudiantes.CountAsync(),
                OasAsignados = await db.CursoObjetivos.CountAsync(c => c.Curso.ProfesorId == profeId),
                Planificaciones = await db.Planificaciones.CountAsync(p => p.Curso.ProfesorId == profeId),
                OasCurriculum = await db.Objetivos.CountAsync(),
                Diagnosticos = await estudiantes.Where(e => e.Diagnostico != null)
                    .GroupBy(e => e.Diagnostico).Select(g => new { Diagnostico = g.Key, Total = g.Count() })
                    .OrderByDescending(x => x.Total).ToListAsync(),
                ResumenCursos = await cursos.OrderBy(c => c.Nivel.Orden).ThenBy(c => c.Letra)
                    .Select(c => new
                    {
                        c.Id, Nombre = c.Nivel.Nombre + " " + c.Letra, c.Anio,
                        Estudiantes = c.Estudiantes.Count, Oas = c.Objetivos.Count,
                        Planificaciones = db.Planificaciones.Count(p => p.CursoId == c.Id),
                    }).ToListAsync(),
            };
        }).RequireAuthorization();
    }
}
