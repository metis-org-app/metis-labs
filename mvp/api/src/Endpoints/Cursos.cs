using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record CursoRequest(int NivelId, string Letra, int Anio);
public record AsignarOasRequest(List<int> ObjetivoIds);
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
                    TotalOas = c.Objetivos.Count, TotalEstudiantes = c.Estudiantes.Count,
                })
                .ToListAsync());

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
            return Results.Created($"/api/cursos/{curso.Id}", new { curso.Id });
        });

        g.MapPut("/{id:int}", async (int id, CursoRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var curso = await db.CursoPropio(id, user);
            if (curso is null) return Results.NotFound();
            curso.NivelId = req.NivelId; curso.Letra = req.Letra.Trim().ToUpperInvariant(); curso.Anio = req.Anio;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await db.Cursos.Where(c => c.Id == id && c.ProfesorId == user.ProfesorId()).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });

        // --- OA asignados al curso ---

        g.MapGet("/{id:int}/oas", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            var oas = await db.CursoObjetivos.Where(c => c.CursoId == id)
                .OrderBy(c => c.Objetivo.Asignatura.Nombre).ThenBy(c => c.Objetivo.Numero)
                .Select(c => new
                {
                    c.Objetivo.Id, Codigo = "OA" + c.Objetivo.Numero, c.Objetivo.Numero, c.Objetivo.Eje,
                    c.Objetivo.Descripcion, Asignatura = c.Objetivo.Asignatura.Nombre, Nivel = c.Objetivo.Nivel.Nombre,
                    Excluidos = db.Exclusiones.Count(x => x.CursoId == id && x.ObjetivoId == c.ObjetivoId),
                })
                .ToListAsync();
            return Results.Ok(oas);
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
            var excluidos = await db.Exclusiones.Where(x => x.CursoId == id && x.ObjetivoId == oaId)
                .Select(x => x.EstudianteId).ToListAsync();
            var estudiantes = await db.Estudiantes.Where(e => e.CursoId == id)
                .OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new { e.Id, e.Nombre, e.Apellido, e.Diagnostico, Excluido = excluidos.Contains(e.Id) })
                .ToListAsync();
            return Results.Ok(estudiantes);
        });

        g.MapPut("/{id:int}/oas/{oaId:int}/exclusiones", async (int id, int oaId, ExclusionesRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(id, user) is null) return Results.NotFound();
            if (!await db.CursoObjetivos.AnyAsync(c => c.CursoId == id && c.ObjetivoId == oaId))
                return Results.Problem("El OA no está asignado a este curso", statusCode: 400);
            var delCurso = await db.Estudiantes.Where(e => e.CursoId == id && req.EstudianteIds.Contains(e.Id))
                .Select(e => e.Id).ToListAsync();
            await db.Exclusiones.Where(x => x.CursoId == id && x.ObjetivoId == oaId).ExecuteDeleteAsync();
            db.Exclusiones.AddRange(delCurso.Select(eid => new ExclusionOA { CursoId = id, ObjetivoId = oaId, EstudianteId = eid }));
            await db.SaveChangesAsync();
            return Results.Ok(new { excluidos = delCurso.Count });
        });

        // --- Panorama del curso (estudiantes PIE, diagnósticos, avance) ---

        g.MapGet("/{id:int}/panorama", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var curso = await db.CursoPropio(id, user);
            if (curso is null) return Results.NotFound();

            var estudiantes = await db.Estudiantes.Where(e => e.CursoId == id)
                .OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new { e.Id, e.Nombre, e.Apellido, e.Diagnostico, e.NivelTea, TipoPie = e.TipoPie.ToString() })
                .ToListAsync();

            var oasPorAsignatura = await db.CursoObjetivos.Where(c => c.CursoId == id)
                .GroupBy(c => c.Objetivo.Asignatura.Nombre)
                .Select(gr => new { Asignatura = gr.Key, Total = gr.Count() })
                .OrderBy(x => x.Asignatura)
                .ToListAsync();

            var planificaciones = await db.Planificaciones.CountAsync(p => p.CursoId == id);
            var exclusiones = await db.Exclusiones.CountAsync(x => x.CursoId == id);

            return Results.Ok(new
            {
                Curso = new { curso.Id, Nombre = curso.Nivel.Nombre + " " + curso.Letra, curso.Anio },
                TotalEstudiantes = estudiantes.Count,
                Permanentes = estudiantes.Where(e => e.TipoPie == nameof(TipoPie.Permanente)),
                Transitorios = estudiantes.Where(e => e.TipoPie == nameof(TipoPie.Transitorio)),
                SinPie = estudiantes.Where(e => e.TipoPie == nameof(TipoPie.Ninguno)),
                Diagnosticos = estudiantes.Where(e => e.Diagnostico != null)
                    .GroupBy(e => e.Diagnostico!).Select(gr => new { Diagnostico = gr.Key, Total = gr.Count() })
                    .OrderByDescending(x => x.Total),
                OasPorAsignatura = oasPorAsignatura,
                TotalOas = oasPorAsignatura.Sum(x => x.Total),
                Planificaciones = planificaciones,
                Exclusiones = exclusiones,
            });
        });
    }
}
