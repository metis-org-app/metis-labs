using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboard(this IEndpointRouteBuilder app)
    {
        // Inicio del profesor: resumen y tareas pendientes.
        app.MapGet("/api/inicio", async (ClaimsPrincipal user, AppDb db) =>
        {
            var profeId = user.ProfesorId();
            var cursos = await db.Cursos.Where(c => c.ProfesorId == profeId)
                .OrderBy(c => c.Nivel.Orden).ThenBy(c => c.Letra)
                .Select(c => new
                {
                    c.Id, Nombre = c.Nivel.Nombre + " " + c.Letra, c.Anio,
                    Estudiantes = c.Estudiantes.Count,
                    EstudiantesPie = c.Estudiantes.Count(e => e.TipoPie != TipoPie.Ninguno),
                    Oas = c.Objetivos.Count,
                    OasCubiertos = c.Objetivos.Count(o => o.Estado == EstadoOa.Cubierto),
                    EvaluacionesAbiertas = db.Evaluaciones.Count(e => e.CursoId == c.Id && e.Estado == EstadoEvaluacion.Publicada),
                })
                .ToListAsync();

            var porRevisar = await db.Evaluaciones.Where(e => e.Curso.ProfesorId == profeId)
                .Select(e => new
                {
                    e.Id, e.Titulo, e.CursoId, Curso = e.Curso.Nivel.Nombre + " " + e.Curso.Letra,
                    Total = db.Intentos.Count(i => i.EvaluacionId == e.Id && i.RevisionPendiente && !i.EsPrueba),
                })
                .Where(x => x.Total > 0).ToListAsync();

            var abiertas = await db.Evaluaciones.Where(e => e.Curso.ProfesorId == profeId && e.Estado == EstadoEvaluacion.Publicada)
                .Select(e => new
                {
                    e.Id, e.Titulo, e.CursoId, Curso = e.Curso.Nivel.Nombre + " " + e.Curso.Letra,
                    Entregas = db.Intentos.Count(i => i.EvaluacionId == e.Id && i.EntregadoEn != null && !i.EsPrueba),
                    Estudiantes = db.Estudiantes.Count(s => s.CursoId == e.CursoId),
                })
                .ToListAsync();

            var borradores = await db.Evaluaciones.Where(e => e.Curso.ProfesorId == profeId && e.Estado == EstadoEvaluacion.Borrador)
                .Select(e => new { e.Id, e.Titulo, e.CursoId, Curso = e.Curso.Nivel.Nombre + " " + e.Curso.Letra })
                .ToListAsync();

            return new
            {
                Cursos = cursos,
                Totales = new
                {
                    Cursos = cursos.Count,
                    Estudiantes = cursos.Sum(c => c.Estudiantes),
                    EstudiantesPie = cursos.Sum(c => c.EstudiantesPie),
                    EvaluacionesAbiertas = abiertas.Count,
                },
                PorRevisar = porRevisar,
                Abiertas = abiertas,
                Borradores = borradores,
            };
        }).RequireAuthorization();
    }
}
