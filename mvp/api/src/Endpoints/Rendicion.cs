using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Domain.Ia;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record IngresoRequest(string Rut);
public record RespuestaRequest(int PreguntaId, List<int>? Seleccion, string? Texto);
public record RespuestasRequest(List<RespuestaRequest> Respuestas);
public record MensajeRequest(int PreguntaId, string Texto);

/// Rendición de evaluaciones por link (sin cuenta): el estudiante se identifica con su RUT.
public static class Rendicion
{
    public static async Task<HashSet<int>> ExcluidosAsync(AppDb db, Evaluacion e, int? estudianteId) =>
        estudianteId is null
            ? []
            : (await db.Exclusiones.Where(x => x.CursoId == e.CursoId && x.EstudianteId == estudianteId).Select(x => x.ObjetivoId).ToListAsync()).ToHashSet();

    /// Preguntas que le corresponden al estudiante: se omiten las de OA de los que está excluido.
    public static List<Pregunta> PreguntasDelIntento(Evaluacion e, HashSet<int> oasExcluidos) =>
        e.Preguntas.Where(p => p.ObjetivoId is null || !oasExcluidos.Contains(p.ObjetivoId.Value)).OrderBy(p => p.Orden).ToList();

    private static Task<Intento?> CargarIntento(AppDb db, string clave) =>
        db.Intentos
            .Include(i => i.Estudiante)
            .Include(i => i.Mensajes)
            .Include(i => i.Evaluacion).ThenInclude(e => e.Curso).ThenInclude(c => c.Nivel)
            .Include(i => i.Evaluacion).ThenInclude(e => e.Asignatura)
            .Include(i => i.Evaluacion).ThenInclude(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Asignatura)
            .Include(i => i.Evaluacion).ThenInclude(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Nivel)
            .SingleOrDefaultAsync(i => i.Clave == clave);

    private static async Task<object> VistaEstudiante(AppDb db, Intento i)
    {
        var e = i.Evaluacion;
        var preguntas = PreguntasDelIntento(e, await ExcluidosAsync(db, e, i.EstudianteId));
        var limite = i.IniciadoEn.AddMinutes(e.DuracionMinutos);
        return new
        {
            i.Clave,
            Estado = i.EntregadoEn is null ? "EnCurso" : "Entregado",
            i.EsPrueba,
            Estudiante = i.Estudiante is null ? null : new { i.Estudiante.Nombre, i.Estudiante.Apellido },
            Evaluacion = new
            {
                e.Titulo, e.Instrucciones, Asignatura = e.Asignatura.Nombre, Curso = Dtos.NombreCurso(e.Curso), Tipo = e.Tipo.ToString(),
                e.DuracionMinutos, e.AsistenteActivo, e.NivelAyuda,
            },
            SegundosRestantes = i.EntregadoEn is null ? Math.Max(0, (int)(limite - DateTime.UtcNow).TotalSeconds) : 0,
            Omitidas = e.Preguntas.Count - preguntas.Count,
            Preguntas = preguntas.Select((p, idx) => new
            {
                p.Id, Numero = idx + 1, Tipo = p.Tipo.ToString(), p.Enunciado, p.Opciones, p.Puntaje,
                Oa = p.Objetivo is null ? null : new { CodigoOficial = Dtos.CodigoOa(p.Objetivo), p.Objetivo.Descripcion },
                Asistente = e.AsistenteActivo && p.AsistenteHabilitado,
            }),
            Respuestas = i.Respuestas.Select(r => new { r.PreguntaId, r.Seleccion, r.Texto }),
            Mensajes = i.Mensajes.OrderBy(m => m.CreadoEn).ThenBy(m => m.Id).Select(m => new { m.PreguntaId, m.Rol, m.Texto, m.NivelAyuda }),
        };
    }

    private static List<RespuestaPregunta> Normalizar(List<RespuestaRequest> respuestas, List<Pregunta> preguntas) =>
        respuestas.Where(r => preguntas.Any(p => p.Id == r.PreguntaId))
            .GroupBy(r => r.PreguntaId).Select(g => g.Last())
            .Select(r => new RespuestaPregunta
            {
                PreguntaId = r.PreguntaId,
                Seleccion = (r.Seleccion ?? []).Distinct().ToList(),
                Texto = string.IsNullOrWhiteSpace(r.Texto) ? null : r.Texto.Trim()[..Math.Min(r.Texto.Trim().Length, 4000)],
            }).ToList();

    public static void MapRendicion(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/publico").RequireRateLimiting("publico");

        g.MapGet("/evaluaciones/{token}", async (string token, AppDb db) =>
        {
            var e = await db.Evaluaciones.Include(x => x.Curso).ThenInclude(c => c.Nivel).Include(x => x.Asignatura)
                .SingleOrDefaultAsync(x => x.Token == token);
            if (e is null || e.Estado == EstadoEvaluacion.Borrador) return Results.Problem("Este link no corresponde a una evaluación disponible", statusCode: 404);
            return Results.Ok(new
            {
                e.Titulo, e.Instrucciones, Asignatura = e.Asignatura.Nombre, Curso = Dtos.NombreCurso(e.Curso), e.Curso.Anio,
                e.DuracionMinutos, Estado = e.Estado.ToString(), e.AsistenteActivo,
                Preguntas = await db.Preguntas.CountAsync(p => p.EvaluacionId == e.Id),
            });
        });

        g.MapPost("/evaluaciones/{token}/ingresar", async (string token, IngresoRequest req, AppDb db) =>
        {
            var e = await db.Evaluaciones.SingleOrDefaultAsync(x => x.Token == token);
            if (e is null || e.Estado == EstadoEvaluacion.Borrador) return Results.Problem("Este link no corresponde a una evaluación disponible", statusCode: 404);
            if (e.Estado == EstadoEvaluacion.Cerrada) return Results.Problem("Esta evaluación ya cerró. Consulta con tu profesor.", statusCode: 409);
            var rut = Rut.Normalizar(req.Rut);
            if (rut is null) return Results.Problem("Revisa tu RUT: el dígito verificador no coincide", statusCode: 400);
            var estudiante = await db.Estudiantes.SingleOrDefaultAsync(s => s.Rut == rut && s.CursoId == e.CursoId);
            if (estudiante is null) return Results.Problem("Tu RUT no está en la nómina de este curso. Avísale a tu profesor.", statusCode: 404);

            var intento = await db.Intentos.SingleOrDefaultAsync(i => i.EvaluacionId == e.Id && i.EstudianteId == estudiante.Id && !i.EsPrueba);
            if (intento?.EntregadoEn is not null) return Results.Problem("Ya entregaste esta evaluación. ¡Bien hecho!", statusCode: 409);
            if (intento is null)
            {
                intento = new Intento { EvaluacionId = e.Id, EstudianteId = estudiante.Id, Clave = EvaluacionesEndpoints.NuevoToken(18) };
                db.Intentos.Add(intento);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { intento.Clave });
        });

        g.MapGet("/intentos/{clave}", async (string clave, AppDb db) =>
        {
            var i = await CargarIntento(db, clave);
            return i is null ? Results.NotFound() : Results.Ok(await VistaEstudiante(db, i));
        });

        // Guardado automático mientras el estudiante responde.
        g.MapPut("/intentos/{clave}/respuestas", async (string clave, RespuestasRequest req, AppDb db) =>
        {
            var i = await CargarIntento(db, clave);
            if (i is null) return Results.NotFound();
            if (i.EntregadoEn is not null) return Results.Problem("La evaluación ya fue entregada", statusCode: 409);
            i.Respuestas = Normalizar(req.Respuestas, PreguntasDelIntento(i.Evaluacion, await ExcluidosAsync(db, i.Evaluacion, i.EstudianteId)));
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Conversación con Metis sobre una pregunta.
        g.MapPost("/intentos/{clave}/mensajes", async (string clave, MensajeRequest req, AppDb db, AsistenteIa asistente, CancellationToken ct) =>
        {
            var i = await CargarIntento(db, clave);
            if (i is null) return Results.NotFound();
            if (i.EntregadoEn is not null) return Results.Problem("La evaluación ya fue entregada", statusCode: 409);
            var texto = req.Texto?.Trim() ?? "";
            if (texto.Length == 0) return Results.Problem("Escribe tu pregunta para Metis", statusCode: 400);
            if (texto.Length > 600) texto = texto[..600];
            var e = i.Evaluacion;
            var p = PreguntasDelIntento(e, await ExcluidosAsync(db, e, i.EstudianteId)).FirstOrDefault(x => x.Id == req.PreguntaId);
            if (p is null) return Results.Problem("Pregunta inválida", statusCode: 400);

            var ayudasPrevias = i.Mensajes.Count(m => m.PreguntaId == p.Id && m.Rol == "metis" && m.NivelAyuda != null);
            var llegada = DateTime.UtcNow;
            var contexto = new AsistenteMetis.Contexto(
                p, p.Objetivo, p.Objetivo is null ? null : Dtos.CodigoOa(p.Objetivo), e.NivelAyuda, e.AsistenteActivo,
                e.InstruccionesAsistente, ayudasPrevias, i.Estudiante?.Diagnostico == "TEA",
                i.Estudiante?.Nombre ?? "profe");
            var historial = i.Mensajes.Where(m => m.PreguntaId == p.Id).OrderBy(m => m.CreadoEn).ThenBy(m => m.Id).ToList();
            var respuesta = await asistente.ResponderAsync(contexto, historial, texto, i.Mensajes.Count(m => m.Rol == "estudiante"), ct);

            // La hora del mensaje del estudiante es la de llegada, no la de la respuesta (que puede tardar unos segundos con IA).
            db.Mensajes.Add(new MensajeAsistente { IntentoId = i.Id, PreguntaId = p.Id, Rol = "estudiante", Texto = texto, CreadoEn = llegada });
            db.Mensajes.Add(new MensajeAsistente { IntentoId = i.Id, PreguntaId = p.Id, Rol = "metis", Texto = respuesta.Texto, NivelAyuda = respuesta.Nivel, PorIa = respuesta.PorIa, CreadoEn = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(new { respuesta.Texto, respuesta.Nivel });
        });

        g.MapPost("/intentos/{clave}/entregar", async (string clave, RespuestasRequest req, AppDb db) =>
        {
            var i = await CargarIntento(db, clave);
            if (i is null) return Results.NotFound();
            if (i.EntregadoEn is not null) return Results.Problem("La evaluación ya fue entregada", statusCode: 409);
            var e = i.Evaluacion;
            var preguntas = PreguntasDelIntento(e, await ExcluidosAsync(db, e, i.EstudianteId));
            var respuestas = Normalizar(req.Respuestas, preguntas);
            // Toda pregunta queda registrada: las no respondidas valen 0.
            foreach (var p in preguntas.Where(p => respuestas.All(r => r.PreguntaId != p.Id)))
                respuestas.Add(new RespuestaPregunta { PreguntaId = p.Id });
            foreach (var r in respuestas) r.Puntaje = Calificacion.Corregir(preguntas.First(p => p.Id == r.PreguntaId), r);
            i.Respuestas = respuestas;
            i.EntregadoEn = DateTime.UtcNow;
            Calificacion.Recalcular(i, preguntas, e.Exigencia);
            await db.SaveChangesAsync();

            // El estudiante no ve la nota (la revisa y comunica el profesor); la vista previa sí la muestra.
            return Results.Ok(new
            {
                Entregada = true,
                Respondidas = respuestas.Count(r => r.Seleccion.Count > 0 || r.Texto is not null),
                Total = preguntas.Count,
                Nota = i.EsPrueba ? i.Nota : null,
                Puntaje = i.EsPrueba ? i.PuntajeObtenido : null,
                i.PuntajeMaximo,
            });
        });
    }
}
