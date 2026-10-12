using System.Security.Claims;
using System.Security.Cryptography;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record NuevaEvaluacionRequest(string Titulo, int AsignaturaId, TipoEvaluacion Tipo);

public record PreguntaRequest(
    TipoPregunta Tipo, string Enunciado, List<string>? Opciones, List<int>? Correctas, decimal Puntaje,
    int? ObjetivoId, bool AsistenteHabilitado, string? PistaDocente, string? Justificacion = null, string? Fuente = null);

public record EvaluacionRequest(
    string Titulo, string? Instrucciones, int AsignaturaId, TipoEvaluacion Tipo, int DuracionMinutos, int Exigencia,
    bool AsistenteActivo, int NivelAyuda, string? InstruccionesAsistente, List<PreguntaRequest> Preguntas);

public record PuntajeRevision(int PreguntaId, decimal Puntaje, string? Comentario);
public record RevisionRequest(List<PuntajeRevision> Puntajes);

public static class EvaluacionesEndpoints
{
    public static string NuevoToken(int bytes = 9) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).Replace('+', 'x').Replace('/', 'y').TrimEnd('=');

    private static Task<Evaluacion?> EvaluacionPropia(AppDb db, int id, ClaimsPrincipal user) =>
        db.Evaluaciones
            .Include(e => e.Curso).ThenInclude(c => c.Nivel)
            .Include(e => e.Asignatura)
            .Include(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Asignatura)
            .Include(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Nivel)
            .SingleOrDefaultAsync(e => e.Id == id && e.Curso.ProfesorId == user.ProfesorId());

    private static object PreguntaDto(Pregunta p) => new
    {
        p.Id, p.Orden, Tipo = p.Tipo.ToString(), p.Enunciado, p.Opciones, p.Correctas, p.Puntaje,
        p.ObjetivoId, Oa = p.Objetivo is null ? null : Dtos.Oa(p.Objetivo), p.AsistenteHabilitado, p.PistaDocente,
        p.Justificacion, p.Fuente,
    };

    public static void MapEvaluaciones(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        g.MapGet("/cursos/{cursoId:int}/evaluaciones", async (int cursoId, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(cursoId, user) is null) return Results.NotFound();
            var totalEstudiantes = await db.Estudiantes.CountAsync(e => e.CursoId == cursoId);
            var evaluaciones = await db.Evaluaciones.Where(e => e.CursoId == cursoId)
                .Include(e => e.Asignatura)
                .Include(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Asignatura)
                .Include(e => e.Preguntas).ThenInclude(p => p.Objetivo).ThenInclude(o => o!.Nivel)
                .OrderByDescending(e => e.CreadaEn).ToListAsync();
            var ids = evaluaciones.Select(e => e.Id).ToList();
            var intentos = await db.Intentos.Where(i => ids.Contains(i.EvaluacionId) && !i.EsPrueba && i.EntregadoEn != null)
                .Select(i => new { i.EvaluacionId, i.Nota, i.RevisionPendiente }).ToListAsync();

            return Results.Ok(evaluaciones.Select(e =>
            {
                var propios = intentos.Where(i => i.EvaluacionId == e.Id).ToList();
                var notas = propios.Where(i => i.Nota != null).Select(i => i.Nota!.Value).ToList();
                return new
                {
                    e.Id, e.Titulo, Tipo = e.Tipo.ToString(), Estado = e.Estado.ToString(), e.Token, e.DuracionMinutos,
                    e.AsignaturaId, Asignatura = e.Asignatura.Nombre, AsignaturaColor = e.Asignatura.Color,
                    e.AsistenteActivo, e.NivelAyuda, e.CreadaEn, e.PublicadaEn,
                    Preguntas = e.Preguntas.Count, PuntajeTotal = e.Preguntas.Sum(p => p.Puntaje),
                    Oas = e.Preguntas.Where(p => p.Objetivo != null).Select(p => p.Objetivo!).DistinctBy(o => o.Id)
                        .OrderBy(o => o.Numero).Select(Dtos.Oa),
                    Entregas = propios.Count, TotalEstudiantes = totalEstudiantes,
                    PorRevisar = propios.Count(i => i.RevisionPendiente),
                    Promedio = notas.Count == 0 ? (decimal?)null : Math.Round(notas.Average(), 1),
                };
            }));
        });

        g.MapPost("/cursos/{cursoId:int}/evaluaciones", async (int cursoId, NuevaEvaluacionRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(cursoId, user) is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
            if (!await db.Asignaturas.AnyAsync(a => a.Id == req.AsignaturaId)) return Results.Problem("Asignatura inválida", statusCode: 400);
            var e = new Evaluacion
            {
                CursoId = cursoId, AsignaturaId = req.AsignaturaId, Titulo = req.Titulo.Trim(), Tipo = req.Tipo, Token = NuevoToken(),
                Instrucciones = "Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.",
            };
            db.Evaluaciones.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/api/evaluaciones/{e.Id}", new { e.Id });
        });

        g.MapGet("/evaluaciones/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            var entregas = await db.Intentos.CountAsync(i => i.EvaluacionId == id && !i.EsPrueba && i.EntregadoEn != null);
            return Results.Ok(new
            {
                e.Id, e.CursoId, Curso = Dtos.NombreCurso(e.Curso), e.Curso.NivelId, e.Titulo, e.Instrucciones,
                e.AsignaturaId, Asignatura = e.Asignatura.Nombre, Tipo = e.Tipo.ToString(), Estado = e.Estado.ToString(),
                e.DuracionMinutos, e.Exigencia, e.Token, e.AsistenteActivo, e.NivelAyuda, e.InstruccionesAsistente,
                e.Dificultad, e.GeneradaConIa, e.CreadaEn, e.PublicadaEn, Entregas = entregas, Bloqueada = entregas > 0,
                Preguntas = e.Preguntas.OrderBy(p => p.Orden).Select(PreguntaDto),
            });
        });

        g.MapPut("/evaluaciones/{id:int}", async (int id, EvaluacionRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
            if (req.DuracionMinutos is < 5 or > 240) return Results.Problem("La duración debe estar entre 5 y 240 minutos", statusCode: 400);
            if (req.Exigencia is < 40 or > 80) return Results.Problem("La exigencia debe estar entre 40% y 80%", statusCode: 400);
            if (req.NivelAyuda is < 1 or > 3) return Results.Problem("El nivel de ayuda debe ser 1, 2 o 3", statusCode: 400);

            e.Titulo = req.Titulo.Trim();
            e.Instrucciones = string.IsNullOrWhiteSpace(req.Instrucciones) ? null : req.Instrucciones.Trim();
            e.Tipo = req.Tipo;
            e.DuracionMinutos = req.DuracionMinutos;
            e.Exigencia = req.Exigencia;
            e.AsistenteActivo = req.AsistenteActivo;
            e.NivelAyuda = req.NivelAyuda;
            e.InstruccionesAsistente = string.IsNullOrWhiteSpace(req.InstruccionesAsistente) ? null : req.InstruccionesAsistente.Trim();

            var conEntregas = await db.Intentos.AnyAsync(i => i.EvaluacionId == id && !i.EsPrueba && i.EntregadoEn != null);
            if (!conEntregas)
            {
                e.AsignaturaId = req.AsignaturaId;
                var oasCurso = await db.CursoObjetivos.Where(c => c.CursoId == e.CursoId).Select(c => c.ObjetivoId).ToListAsync();
                var nuevas = new List<Pregunta>();
                for (var i = 0; i < req.Preguntas.Count; i++)
                {
                    var (p, error) = ValidarPregunta(req.Preguntas[i], i + 1, oasCurso);
                    if (error is not null) return error;
                    nuevas.Add(p!);
                }
                // Las vistas previas guardan respuestas por id de pregunta: se descartan al rehacer las preguntas.
                await db.Intentos.Where(i => i.EvaluacionId == id && i.EsPrueba).ExecuteDeleteAsync();
                db.Preguntas.RemoveRange(e.Preguntas);
                e.Preguntas = nuevas;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { preguntasBloqueadas = conEntregas });
        });

        g.MapPost("/evaluaciones/{id:int}/publicar", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            if (e.Preguntas.Count == 0) return Results.Problem("Agrega al menos una pregunta antes de publicar", statusCode: 400);
            e.Estado = EstadoEvaluacion.Publicada;
            e.PublicadaEn ??= DateTime.UtcNow;
            // Los OA evaluados pasan a "En progreso" si estaban pendientes.
            var oas = e.Preguntas.Where(p => p.ObjetivoId != null).Select(p => p.ObjetivoId!.Value).Distinct().ToList();
            await db.CursoObjetivos.Where(c => c.CursoId == e.CursoId && oas.Contains(c.ObjetivoId) && c.Estado == EstadoOa.Pendiente)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Estado, EstadoOa.EnProgreso));
            await db.SaveChangesAsync();
            return Results.Ok(new { e.Token });
        });

        g.MapPost("/evaluaciones/{id:int}/cerrar", async (int id, ClaimsPrincipal user, AppDb db) =>
            await CambiarEstado(db, id, user, EstadoEvaluacion.Cerrada));
        g.MapPost("/evaluaciones/{id:int}/reabrir", async (int id, ClaimsPrincipal user, AppDb db) =>
            await CambiarEstado(db, id, user, EstadoEvaluacion.Publicada));

        g.MapPost("/evaluaciones/{id:int}/duplicar", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            var copia = new Evaluacion
            {
                CursoId = e.CursoId, AsignaturaId = e.AsignaturaId, Titulo = $"{e.Titulo} (copia)", Instrucciones = e.Instrucciones,
                Tipo = e.Tipo, DuracionMinutos = e.DuracionMinutos, Exigencia = e.Exigencia, Token = NuevoToken(),
                AsistenteActivo = e.AsistenteActivo, NivelAyuda = e.NivelAyuda, InstruccionesAsistente = e.InstruccionesAsistente,
                Preguntas = e.Preguntas.OrderBy(p => p.Orden).Select(p => new Pregunta
                {
                    Orden = p.Orden, Tipo = p.Tipo, Enunciado = p.Enunciado, Opciones = [.. p.Opciones], Correctas = [.. p.Correctas],
                    Puntaje = p.Puntaje, ObjetivoId = p.ObjetivoId, AsistenteHabilitado = p.AsistenteHabilitado, PistaDocente = p.PistaDocente,
                    Justificacion = p.Justificacion, Fuente = p.Fuente,
                }).ToList(),
                Dificultad = e.Dificultad, GeneradaConIa = e.GeneradaConIa,
            };
            db.Evaluaciones.Add(copia);
            await db.SaveChangesAsync();
            return Results.Ok(new { copia.Id });
        });

        g.MapDelete("/evaluaciones/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var n = await db.Evaluaciones.Where(e => e.Id == id && e.Curso.ProfesorId == user.ProfesorId()).ExecuteDeleteAsync();
            return n == 0 ? Results.NotFound() : Results.NoContent();
        });

        // Vista previa: el profesor rinde la evaluación como estudiante (no cuenta en resultados).
        g.MapPost("/evaluaciones/{id:int}/vista-previa", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            if (e.Preguntas.Count == 0) return Results.Problem("Agrega al menos una pregunta para ver la vista previa", statusCode: 400);
            var intento = new Intento { EvaluacionId = id, EsPrueba = true, Clave = NuevoToken(18) };
            db.Intentos.Add(intento);
            await db.SaveChangesAsync();
            return Results.Ok(new { intento.Clave });
        });

        g.MapGet("/evaluaciones/{id:int}/resultados", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await EvaluacionPropia(db, id, user);
            if (e is null) return Results.NotFound();
            var estudiantes = await db.Estudiantes.Where(x => x.CursoId == e.CursoId).OrderBy(x => x.Apellido).ThenBy(x => x.Nombre).ToListAsync();
            var intentos = await db.Intentos.Where(i => i.EvaluacionId == id && !i.EsPrueba)
                .Select(i => new
                {
                    i.Id, i.EstudianteId, i.EntregadoEn, i.PuntajeObtenido, i.PuntajeMaximo, i.Nota, i.RevisionPendiente, i.Respuestas,
                    Ayudas = i.Mensajes.Count(m => m.Rol == "metis" && m.NivelAyuda != null),
                })
                .ToListAsync();
            var entregados = intentos.Where(i => i.EntregadoEn != null).ToList();
            var notas = entregados.Where(i => i.Nota != null).Select(i => i.Nota!.Value).ToList();
            var ayudasPorPregunta = await db.Mensajes
                .Where(m => m.Rol == "metis" && m.NivelAyuda != null && m.PreguntaId != null)
                .Join(db.Intentos.Where(i => i.EvaluacionId == id && !i.EsPrueba), m => m.IntentoId, i => i.Id, (m, i) => m.PreguntaId!.Value)
                .GroupBy(x => x).Select(gr => new { gr.Key, Total = gr.Count() }).ToDictionaryAsync(x => x.Key, x => x.Total);
            var logro = await Logro.PorOaAsync(db, evaluacionId: id);

            return Results.Ok(new
            {
                Evaluacion = new { e.Id, e.Titulo, e.CursoId, Curso = Dtos.NombreCurso(e.Curso), Tipo = e.Tipo.ToString(), Estado = e.Estado.ToString(), e.Exigencia, e.Token },
                Resumen = new
                {
                    Estudiantes = estudiantes.Count,
                    Entregas = entregados.Count,
                    EnCurso = intentos.Count(i => i.EntregadoEn == null),
                    PorRevisar = entregados.Count(i => i.RevisionPendiente),
                    Promedio = notas.Count == 0 ? (decimal?)null : Math.Round(notas.Average(), 1),
                    Aprobados = notas.Count(n => n >= 4.0m),
                    ConNota = notas.Count,
                },
                Estudiantes = estudiantes.Select(s =>
                {
                    var i = intentos.FirstOrDefault(x => x.EstudianteId == s.Id);
                    var estado = i is null ? "Pendiente" : i.EntregadoEn is null ? "En curso" : i.RevisionPendiente ? "Por revisar" : "Revisada";
                    return new
                    {
                        s.Id, s.Nombre, s.Apellido, s.Diagnostico, s.NivelTea, Estado = estado, IntentoId = i?.Id,
                        i?.PuntajeObtenido, i?.PuntajeMaximo, i?.Nota, Ayudas = i?.Ayudas ?? 0,
                    };
                }),
                Preguntas = e.Preguntas.OrderBy(p => p.Orden).Select(p =>
                {
                    var resp = entregados.SelectMany(i => i.Respuestas).Where(r => r.PreguntaId == p.Id && r.Puntaje != null).ToList();
                    return new
                    {
                        p.Id, p.Orden, Tipo = p.Tipo.ToString(), p.Enunciado, Oa = p.Objetivo is null ? null : Dtos.Oa(p.Objetivo),
                        Respondidas = resp.Count,
                        Logro = resp.Count == 0 ? (decimal?)null : Math.Round(100 * resp.Sum(r => r.Puntaje!.Value) / (resp.Count * p.Puntaje), 0),
                        Ayudas = ayudasPorPregunta.GetValueOrDefault(p.Id),
                    };
                }),
                LogroOa = e.Preguntas.Where(p => p.Objetivo != null).Select(p => p.Objetivo!).DistinctBy(o => o.Id)
                    .Where(o => logro.ContainsKey(o.Id)).OrderBy(o => o.Numero)
                    .Select(o => new { Oa = Dtos.Oa(o), logro[o.Id].Porcentaje, logro[o.Id].Nivel }),
            });
        });

        // Detalle de un intento: respuestas, corrección y conversación con Metis.
        g.MapGet("/intentos/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var i = await db.Intentos.Include(x => x.Estudiante).Include(x => x.Mensajes)
                .SingleOrDefaultAsync(x => x.Id == id && x.Evaluacion.Curso.ProfesorId == user.ProfesorId());
            if (i is null) return Results.NotFound();
            var e = (await EvaluacionPropia(db, i.EvaluacionId, user))!;
            var preguntas = Rendicion.PreguntasDelIntento(e, await Rendicion.ExcluidosAsync(db, e, i.EstudianteId));
            return Results.Ok(new
            {
                i.Id, i.EvaluacionId, Evaluacion = e.Titulo, e.CursoId, e.Exigencia,
                Estudiante = i.Estudiante is null ? null : new { i.Estudiante.Id, i.Estudiante.Nombre, i.Estudiante.Apellido, i.Estudiante.Diagnostico, i.Estudiante.NivelTea },
                i.IniciadoEn, i.EntregadoEn, i.PuntajeObtenido, i.PuntajeMaximo, i.Nota, i.RevisionPendiente,
                Omitidas = e.Preguntas.Count - preguntas.Count,
                Preguntas = preguntas.Select(p =>
                {
                    var r = i.Respuestas.FirstOrDefault(x => x.PreguntaId == p.Id);
                    return new
                    {
                        Pregunta = PreguntaDto(p),
                        Respuesta = r is null ? null : new { r.Seleccion, r.Texto, r.Puntaje, r.Comentario },
                        Conversacion = i.Mensajes.Where(m => m.PreguntaId == p.Id).OrderBy(m => m.CreadoEn).ThenBy(m => m.Id)
                            .Select(m => new { m.Rol, m.Texto, m.NivelAyuda, m.PorIa, m.CreadoEn }),
                    };
                }),
            });
        });

        g.MapPut("/intentos/{id:int}/revision", async (int id, RevisionRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var i = await db.Intentos.SingleOrDefaultAsync(x => x.Id == id && x.Evaluacion.Curso.ProfesorId == user.ProfesorId());
            if (i is null) return Results.NotFound();
            if (i.EntregadoEn is null) return Results.Problem("El estudiante aún no entrega esta evaluación", statusCode: 400);
            var e = (await EvaluacionPropia(db, i.EvaluacionId, user))!;
            var preguntas = Rendicion.PreguntasDelIntento(e, await Rendicion.ExcluidosAsync(db, e, i.EstudianteId));
            var respuestas = i.Respuestas.Select(r => new RespuestaPregunta
            {
                PreguntaId = r.PreguntaId, Seleccion = r.Seleccion, Texto = r.Texto, Puntaje = r.Puntaje, Comentario = r.Comentario,
            }).ToList();
            foreach (var pr in req.Puntajes)
            {
                var p = preguntas.FirstOrDefault(x => x.Id == pr.PreguntaId);
                if (p is null) return Results.Problem("Pregunta inválida", statusCode: 400);
                if (pr.Puntaje < 0 || pr.Puntaje > p.Puntaje)
                    return Results.Problem($"El puntaje de la pregunta {p.Orden} debe estar entre 0 y {p.Puntaje}", statusCode: 400);
                var r = respuestas.FirstOrDefault(x => x.PreguntaId == p.Id);
                if (r is null) respuestas.Add(r = new RespuestaPregunta { PreguntaId = p.Id });
                r.Puntaje = pr.Puntaje;
                r.Comentario = string.IsNullOrWhiteSpace(pr.Comentario) ? null : pr.Comentario.Trim();
            }
            i.Respuestas = respuestas;
            Calificacion.Recalcular(i, preguntas, e.Exigencia);
            await db.SaveChangesAsync();
            return Results.Ok(new { i.Nota, i.PuntajeObtenido, i.RevisionPendiente });
        });
    }

    private static async Task<IResult> CambiarEstado(AppDb db, int id, ClaimsPrincipal user, EstadoEvaluacion estado)
    {
        var e = await db.Evaluaciones.SingleOrDefaultAsync(x => x.Id == id && x.Curso.ProfesorId == user.ProfesorId());
        if (e is null) return Results.NotFound();
        if (e.Estado == EstadoEvaluacion.Borrador) return Results.Problem("Primero publica la evaluación", statusCode: 400);
        e.Estado = estado;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    internal static (Pregunta? Pregunta, IResult? Error) ValidarPregunta(PreguntaRequest r, int orden, List<int> oasCurso)
    {
        IResult Error(string msg) => Results.Problem($"Pregunta {orden}: {msg}", statusCode: 400);
        if (string.IsNullOrWhiteSpace(r.Enunciado)) return (null, Error("escribe el enunciado"));
        if (r.Puntaje <= 0 || r.Puntaje > 20) return (null, Error("el puntaje debe estar entre 0,5 y 20"));
        if (r.ObjetivoId is not null && !oasCurso.Contains(r.ObjetivoId.Value)) return (null, Error("el OA no está asignado a este curso"));

        var opciones = r.Tipo switch
        {
            TipoPregunta.VerdaderoFalso => ["Verdadero", "Falso"],
            TipoPregunta.Abierta => [],
            _ => (r.Opciones ?? []).Select(o => o.Trim()).Where(o => o.Length > 0).ToList(),
        };
        var correctas = r.Tipo == TipoPregunta.Abierta ? [] : (r.Correctas ?? []).Distinct().Order().ToList();
        if (r.Tipo is TipoPregunta.Unica or TipoPregunta.Multiple && opciones.Count < 2) return (null, Error("agrega al menos dos alternativas"));
        if (r.Tipo != TipoPregunta.Abierta)
        {
            if (correctas.Count == 0 || correctas.Any(c => c < 0 || c >= opciones.Count)) return (null, Error("marca la alternativa correcta"));
            if (r.Tipo != TipoPregunta.Multiple && correctas.Count != 1) return (null, Error("marca solo una alternativa correcta"));
        }

        return (new Pregunta
        {
            Orden = orden, Tipo = r.Tipo, Enunciado = r.Enunciado.Trim(), Opciones = opciones, Correctas = correctas,
            Puntaje = r.Puntaje, ObjetivoId = r.ObjetivoId, AsistenteHabilitado = r.AsistenteHabilitado,
            PistaDocente = string.IsNullOrWhiteSpace(r.PistaDocente) ? null : r.PistaDocente.Trim(),
            Justificacion = string.IsNullOrWhiteSpace(r.Justificacion) ? null : r.Justificacion.Trim(),
            Fuente = string.IsNullOrWhiteSpace(r.Fuente) ? null : r.Fuente.Trim(),
        }, null);
    }
}
