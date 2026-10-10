using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record CursoRequest(int NivelId, string Letra, int Anio, List<int>? AsignaturaIds = null);
public record AsignarOasRequest(List<int> ObjetivoIds);
public record EstadoOaRequest(EstadoOa Estado);
public record ExclusionesRequest(List<int> EstudianteIds);

public static class CursosEndpoints
{
    public static Task<Curso?> CursoPropio(this AppDb db, int cursoId, ClaimsPrincipal user) =>
        db.Cursos.Include(c => c.Nivel).SingleOrDefaultAsync(c => c.Id == cursoId && c.ProfesorId == user.ProfesorId());

    public static void MapCursos(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/cursos").RequireAuthorization();

        g.MapGet("/", (ClaimsPrincipal user, AppDb db) =>
            db.Cursos.Where(c => c.ProfesorId == user.ProfesorId())
                .OrderByDescending(c => c.Anio).ThenBy(c => c.Nivel.Orden).ThenBy(c => c.Letra)
                .Select(c => new
                {
                    c.Id, c.NivelId, Nivel = c.Nivel.Nombre, c.Letra, c.Anio,
                    Nombre = c.Nivel.Nombre + " " + c.Letra,
                    TotalOas = c.Objetivos.Count,
                    OasCubiertos = c.Objetivos.Count(o => o.Estado == EstadoOa.Cubierto),
                    TotalEstudiantes = c.Estudiantes.Count,
                    EstudiantesPie = c.Estudiantes.Count(e => e.TipoPie != TipoPie.Ninguno),
                    EvaluacionesAbiertas = db.Evaluaciones.Count(e => e.CursoId == c.Id && e.Estado == EstadoEvaluacion.Publicada),
                    Asignaturas = c.Objetivos.Select(o => o.Objetivo.Asignatura.Nombre).Distinct().ToList(),
                })
                .ToListAsync());

        g.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var c = await db.CursoPropio(id, user);
            if (c is null) return Results.NotFound();
            return Results.Ok(new
            {
                c.Id, c.NivelId, Nivel = c.Nivel.Nombre, c.Nivel.Ciclo, c.Letra, c.Anio, Nombre = Dtos.NombreCurso(c),
                TotalEstudiantes = await db.Estudiantes.CountAsync(e => e.CursoId == id),
                TotalOas = await db.CursoObjetivos.CountAsync(o => o.CursoId == id),
            });
        });

        g.MapPost("/", async (CursoRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var letra = req.Letra.Trim().ToUpperInvariant();
            if (letra.Length is 0 or > 3) return Results.Problem("La letra del curso es obligatoria (ej: A)", statusCode: 400);
            if (!await db.Niveles.AnyAsync(n => n.Id == req.NivelId)) return Results.Problem("Nivel inválido", statusCode: 400);
            var profeId = user.ProfesorId();
            if (await db.Cursos.AnyAsync(c => c.ProfesorId == profeId && c.NivelId == req.NivelId && c.Letra == letra && c.Anio == req.Anio))
                return Results.Problem("Ya tienes ese curso para ese año", statusCode: 409);
            var curso = new Curso { ProfesorId = profeId, NivelId = req.NivelId, Letra = letra, Anio = req.Anio };
            db.Cursos.Add(curso);
            await db.SaveChangesAsync();
            // Asigna todos los OA del nivel de las asignaturas elegidas.
            if (req.AsignaturaIds is { Count: > 0 } ids)
            {
                var oas = await db.Objetivos.Where(o => o.NivelId == req.NivelId && ids.Contains(o.AsignaturaId)).Select(o => o.Id).ToListAsync();
                db.CursoObjetivos.AddRange(oas.Select(oaId => new CursoOA { CursoId = curso.Id, ObjetivoId = oaId }));
                await db.SaveChangesAsync();
            }
            return Results.Created($"/api/cursos/{curso.Id}", new { curso.Id });
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await db.Cursos.Where(c => c.Id == id && c.ProfesorId == user.ProfesorId()).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });

        // --- Currículum del curso: OA asignados, estado de cobertura, planificación y logro ---

        g.MapGet("/{id:int}/oas", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            var asignados = await db.CursoObjetivos.Where(c => c.CursoId == id)
                .Include(c => c.Objetivo).ThenInclude(o => o.Asignatura)
                .Include(c => c.Objetivo).ThenInclude(o => o.Nivel)
                .ToListAsync();
            var exclusiones = await db.Exclusiones.Where(x => x.CursoId == id).GroupBy(x => x.ObjetivoId)
                .Select(g => new { g.Key, Total = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Total);
            var planificado = await db.Planificaciones.Where(p => p.CursoId == id).SelectMany(p => p.Objetivos.Select(o => o.Id))
                .GroupBy(x => x).Select(g => new { g.Key, Total = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Total);
            var evaluado = await db.Preguntas.Where(p => p.Evaluacion.CursoId == id && p.ObjetivoId != null)
                .Select(p => new { OaId = p.ObjetivoId!.Value, p.EvaluacionId }).Distinct()
                .GroupBy(x => x.OaId).Select(g => new { g.Key, Total = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Total);
            var logro = await Logro.PorOaAsync(db, cursoId: id);

            return Results.Ok(asignados
                .OrderBy(c => c.Objetivo.Asignatura.Nombre).ThenBy(c => c.Objetivo.Numero)
                .Select(c => new
                {
                    Oa = Dtos.Oa(c.Objetivo),
                    Estado = c.Estado.ToString(),
                    Excluidos = exclusiones.GetValueOrDefault(c.ObjetivoId),
                    Planificaciones = planificado.GetValueOrDefault(c.ObjetivoId),
                    Evaluaciones = evaluado.GetValueOrDefault(c.ObjetivoId),
                    Logro = logro.TryGetValue(c.ObjetivoId, out var l) ? new { l.Porcentaje, l.Nivel } : null,
                }));
        });

        g.MapPost("/{id:int}/oas", async (int id, AsignarOasRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            var existentes = await db.CursoObjetivos.Where(c => c.CursoId == id).Select(c => c.ObjetivoId).ToListAsync();
            var validos = await db.Objetivos.Where(o => req.ObjetivoIds.Contains(o.Id)).Select(o => o.Id).ToListAsync();
            var nuevos = validos.Except(existentes).ToList();
            db.CursoObjetivos.AddRange(nuevos.Select(oaId => new CursoOA { CursoId = id, ObjetivoId = oaId }));
            await db.SaveChangesAsync();
            return Results.Ok(new { asignados = nuevos.Count, yaExistian = validos.Count - nuevos.Count });
        });

        g.MapPut("/{id:int}/oas/{oaId:int}/estado", async (int id, int oaId, EstadoOaRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            var n = await db.CursoObjetivos.Where(c => c.CursoId == id && c.ObjetivoId == oaId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Estado, req.Estado));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        });

        g.MapDelete("/{id:int}/oas/{oaId:int}", async (int id, int oaId, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            await db.CursoObjetivos.Where(c => c.CursoId == id && c.ObjetivoId == oaId).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        // --- Exclusión de estudiantes por OA (adecuación curricular) ---

        g.MapGet("/{id:int}/oas/{oaId:int}/exclusiones", async (int id, int oaId, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            var excluidos = await db.Exclusiones.Where(x => x.CursoId == id && x.ObjetivoId == oaId).Select(x => x.EstudianteId).ToListAsync();
            return Results.Ok(await db.Estudiantes.Where(e => e.CursoId == id)
                .OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new { e.Id, e.Nombre, e.Apellido, e.Diagnostico, e.NivelTea, Excluido = excluidos.Contains(e.Id) })
                .ToListAsync());
        });

        g.MapPut("/{id:int}/oas/{oaId:int}/exclusiones", async (int id, int oaId, ExclusionesRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            if (!await db.CursoObjetivos.AnyAsync(c => c.CursoId == id && c.ObjetivoId == oaId))
                return Results.Problem("El OA no está asignado a este curso", statusCode: 400);
            var delCurso = await db.Estudiantes.Where(e => e.CursoId == id && req.EstudianteIds.Contains(e.Id)).Select(e => e.Id).ToListAsync();
            await db.Exclusiones.Where(x => x.CursoId == id && x.ObjetivoId == oaId).ExecuteDeleteAsync();
            db.Exclusiones.AddRange(delCurso.Select(eid => new ExclusionOA { CursoId = id, ObjetivoId = oaId, EstudianteId = eid }));
            await db.SaveChangesAsync();
            return Results.Ok(new { excluidos = delCurso.Count });
        });

        // --- Resumen del curso (panorama PIE, cobertura curricular, evaluaciones) ---

        g.MapGet("/{id:int}/resumen", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var curso = await db.CursoPropio(id, user);
            if (curso is null) return Results.NotFound();

            var estudiantes = await db.Estudiantes.Where(e => e.CursoId == id)
                .OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new { e.Id, e.Nombre, e.Apellido, e.Diagnostico, e.NivelTea, TipoPie = e.TipoPie.ToString() })
                .ToListAsync();
            var oas = await db.CursoObjetivos.Where(c => c.CursoId == id)
                .Select(c => new { Asignatura = c.Objetivo.Asignatura.Nombre, c.Objetivo.Asignatura.Color, c.Estado }).ToListAsync();
            var evaluaciones = await db.Evaluaciones.Where(e => e.CursoId == id)
                .OrderByDescending(e => e.CreadaEn)
                .Select(e => new
                {
                    e.Id, e.Titulo, Estado = e.Estado.ToString(), Tipo = e.Tipo.ToString(),
                    Entregas = db.Intentos.Count(i => i.EvaluacionId == e.Id && i.EntregadoEn != null && !i.EsPrueba),
                    PorRevisar = db.Intentos.Count(i => i.EvaluacionId == e.Id && i.RevisionPendiente && !i.EsPrueba),
                })
                .Take(4).ToListAsync();
            var logro = await Logro.PorOaAsync(db, cursoId: id);

            return Results.Ok(new
            {
                Curso = new { curso.Id, Nombre = Dtos.NombreCurso(curso), curso.Anio, curso.Nivel.Ciclo },
                TotalEstudiantes = estudiantes.Count,
                Permanentes = estudiantes.Where(e => e.TipoPie == nameof(TipoPie.Permanente)),
                Transitorios = estudiantes.Where(e => e.TipoPie == nameof(TipoPie.Transitorio)),
                SinPie = estudiantes.Count(e => e.TipoPie == nameof(TipoPie.Ninguno)),
                Diagnosticos = estudiantes.Where(e => e.Diagnostico != null).GroupBy(e => e.Diagnostico!)
                    .Select(g => new { Diagnostico = g.Key, Total = g.Count() }).OrderByDescending(x => x.Total),
                Cobertura = oas.GroupBy(o => new { o.Asignatura, o.Color }).OrderBy(g => g.Key.Asignatura).Select(g => new
                {
                    g.Key.Asignatura, g.Key.Color, Total = g.Count(),
                    Cubiertos = g.Count(o => o.Estado == EstadoOa.Cubierto),
                    EnProgreso = g.Count(o => o.Estado == EstadoOa.EnProgreso),
                }),
                TotalOas = oas.Count,
                OasCubiertos = oas.Count(o => o.Estado == EstadoOa.Cubierto),
                Exclusiones = await db.Exclusiones.CountAsync(x => x.CursoId == id),
                Planificaciones = await db.Planificaciones.CountAsync(p => p.CursoId == id),
                LogroPromedio = logro.Count == 0 ? (decimal?)null : Math.Round(logro.Values.Average(l => l.Porcentaje), 0),
                OasPorLograr = logro.Values.Count(l => l.Porcentaje < 60),
                Evaluaciones = evaluaciones,
            });
        });
    }
}
