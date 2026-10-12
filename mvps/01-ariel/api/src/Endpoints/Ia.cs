using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Domain.Ia;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record GenerarRequest(
    int AsignaturaId, string? Consigna, List<int>? OaIds, List<int>? MaterialIds, int Cantidad, string? Dificultad,
    List<TipoPregunta>? Tipos, TipoEvaluacion Tipo);

public record EsquemaRequest(
    string Titulo, string? Instrucciones, int AsignaturaId, TipoEvaluacion Tipo, int DuracionMinutos, string? Dificultad,
    bool GeneradaConIa, List<PreguntaRequest> Preguntas);

/// Evalia dentro de Metis: crear evaluaciones con IA desde los OA del curso, la consigna y los materiales del profesor.
public static class IaEndpoints
{
    private static readonly string[] Dificultades = ["Básico", "Intermedio", "Avanzado"];
    private const int MaximoMateriales = 5;
    private const int MaximoTextoMaterial = 150_000;

    public static void MapIa(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        g.MapGet("/ia/estado", (ClienteIa ia) => new { ia.Disponible, ia.Modelo });

        // Paso "Procesando" del asistente de creación: devuelve un esquema editable, todavía sin guardar.
        g.MapPost("/cursos/{cursoId:int}/evaluaciones/generar", async (
            int cursoId, GenerarRequest req, ClaimsPrincipal user, AppDb db, GeneradorEvaluaciones generador, CancellationToken ct) =>
        {
            var curso = await db.CursoPropio(cursoId, user);
            if (curso is null) return Results.NotFound();
            var asignatura = await db.Asignaturas.FindAsync([req.AsignaturaId], ct);
            if (asignatura is null) return Results.Problem("Elige la asignatura", statusCode: 400);
            if (req.Cantidad is < 1 or > GeneradorEvaluaciones.MaximoPreguntas)
                return Results.Problem($"La cantidad de preguntas debe estar entre 1 y {GeneradorEvaluaciones.MaximoPreguntas}", statusCode: 400);
            var tipos = req.Tipos is { Count: > 0 } t ? t.Distinct().ToList() : [TipoPregunta.Unica, TipoPregunta.Multiple, TipoPregunta.VerdaderoFalso, TipoPregunta.Abierta];
            var dificultad = Dificultades.FirstOrDefault(d => d.Equals(req.Dificultad, StringComparison.OrdinalIgnoreCase)) ?? "Intermedio";

            // Los OA tienen que estar en el currículum del curso. Sin selección, se usan los de la asignatura.
            var oasCurso = db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel)
                .Where(o => db.CursoObjetivos.Any(c => c.CursoId == cursoId && c.ObjetivoId == o.Id));
            var oas = req.OaIds is { Count: > 0 } ids
                ? await oasCurso.Where(o => ids.Contains(o.Id)).ToListAsync(ct)
                : await oasCurso.Where(o => o.AsignaturaId == req.AsignaturaId).ToListAsync(ct);
            if (oas.Count == 0) return Results.Problem("Elige al menos un OA del curso (o asígnale OA de esta asignatura al curso)", statusCode: 400);

            var materialIds = req.MaterialIds ?? [];
            if (materialIds.Count > MaximoMateriales) return Results.Problem($"Puedes usar hasta {MaximoMateriales} materiales por evaluación", statusCode: 400);
            var profeId = user.ProfesorId();
            var materiales = await db.Materiales.Include(m => m.Archivo)
                .Where(m => materialIds.Contains(m.Id) && (m.CursoId == null || m.Curso!.ProfesorId == profeId)).ToListAsync(ct);

            var solicitud = new SolicitudGeneracion(
                asignatura.Nombre, curso.Nivel.Nombre, req.Consigna,
                oas.OrderBy(o => o.Numero).Select(o => new OaParaIa(o.Id, Dtos.CodigoOa(o), o.Descripcion, o.Eje)).ToList(),
                materiales.Select(m => new MaterialParaIa(m.Titulo,
                    LectorArchivos.EsPdf(m.ArchivoTipo) ? null : Recortar(m.Contenido ?? m.Descripcion ?? ""),
                    LectorArchivos.EsPdf(m.ArchivoTipo) ? m.Archivo?.Datos : null)).ToList(),
                req.Cantidad, dificultad, tipos, req.Tipo,
                await db.Estudiantes.AnyAsync(e => e.CursoId == cursoId && e.Diagnostico == "TEA", ct));

            var r = await generador.GenerarAsync(solicitud, ct);
            var porId = oas.ToDictionary(o => o.Id);
            return Results.Ok(new
            {
                r.Titulo, r.Instrucciones, r.PorIa, r.Aviso, Dificultad = dificultad,
                Preguntas = r.Preguntas.Select(p => new
                {
                    Tipo = p.Tipo.ToString(), p.Enunciado, p.Opciones, p.Correctas, p.Puntaje, p.ObjetivoId,
                    Oa = p.ObjetivoId is { } id ? Dtos.Oa(porId[id]) : null,
                    p.PistaDocente, p.Justificacion, p.Fuente, AsistenteHabilitado = true,
                }),
            });
        });

        // Paso final del asistente: crea la evaluación (borrador) con el esquema revisado por el profesor.
        g.MapPost("/cursos/{cursoId:int}/evaluaciones/desde-esquema", async (int cursoId, EsquemaRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            if (await db.CursoPropio(cursoId, user) is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Titulo)) return Results.Problem("El título es obligatorio", statusCode: 400);
            if (!await db.Asignaturas.AnyAsync(a => a.Id == req.AsignaturaId)) return Results.Problem("Asignatura inválida", statusCode: 400);
            if (req.Preguntas.Count == 0) return Results.Problem("El esquema no tiene preguntas", statusCode: 400);
            var oasCurso = await db.CursoObjetivos.Where(c => c.CursoId == cursoId).Select(c => c.ObjetivoId).ToListAsync();
            var preguntas = new List<Pregunta>();
            for (var i = 0; i < req.Preguntas.Count; i++)
            {
                var (p, error) = EvaluacionesEndpoints.ValidarPregunta(req.Preguntas[i], i + 1, oasCurso);
                if (error is not null) return error;
                preguntas.Add(p!);
            }
            var e = new Evaluacion
            {
                CursoId = cursoId, AsignaturaId = req.AsignaturaId, Titulo = req.Titulo.Trim(), Tipo = req.Tipo,
                Instrucciones = string.IsNullOrWhiteSpace(req.Instrucciones) ? null : req.Instrucciones.Trim(),
                DuracionMinutos = Math.Clamp(req.DuracionMinutos, 5, 240), Token = EvaluacionesEndpoints.NuevoToken(),
                Dificultad = Dificultades.FirstOrDefault(d => d == req.Dificultad), GeneradaConIa = req.GeneradaConIa,
                Preguntas = preguntas,
            };
            db.Evaluaciones.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/api/evaluaciones/{e.Id}", new { e.Id });
        });
    }

    public static void MapReportesIa(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        // Todas las conversaciones con Metis de una evaluación (sin vistas previas), para filtrar por pregunta o estudiante.
        g.MapGet("/evaluaciones/{id:int}/conversaciones", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await db.Evaluaciones.Include(x => x.Preguntas).SingleOrDefaultAsync(x => x.Id == id && x.Curso.ProfesorId == user.ProfesorId());
            if (e is null) return Results.NotFound();
            var intentos = await db.Intentos.Where(i => i.EvaluacionId == id && !i.EsPrueba)
                .Include(i => i.Estudiante).Include(i => i.Mensajes).ToListAsync();
            var preguntas = e.Preguntas.ToDictionary(p => p.Id);
            return Results.Ok(intentos.SelectMany(i => i.Mensajes.Where(m => m.PreguntaId != null && preguntas.ContainsKey(m.PreguntaId.Value))
                .GroupBy(m => m.PreguntaId!.Value).Select(gr =>
            {
                var p = preguntas[gr.Key];
                var mensajes = gr.OrderBy(m => m.CreadoEn).ThenBy(m => m.Id).ToList();
                return new
                {
                    IntentoId = i.Id, EstudianteId = i.Estudiante?.Id, Estudiante = i.Estudiante is null ? "—" : Dtos.NombreEstudiante(i.Estudiante),
                    i.Estudiante?.Diagnostico, PreguntaId = p.Id, PreguntaOrden = p.Orden, p.Enunciado,
                    Ayudas = mensajes.Count(m => m.Rol == "metis" && m.NivelAyuda != null),
                    NivelMaximo = mensajes.Max(m => m.NivelAyuda),
                    Mensajes = mensajes.Select(m => new { m.Rol, m.Texto, m.NivelAyuda, m.PorIa, m.CreadoEn }),
                };
            })).OrderBy(c => c.PreguntaOrden).ThenBy(c => c.Estudiante));
        });

        // Dudas frecuentes: la IA agrupa por concepto lo que los estudiantes le preguntaron a Metis.
        g.MapPost("/evaluaciones/{id:int}/dudas", async (int id, ClaimsPrincipal user, AppDb db, AnalistaDudas analista, CancellationToken ct) =>
        {
            var e = await db.Evaluaciones.Include(x => x.Preguntas).SingleOrDefaultAsync(x => x.Id == id && x.Curso.ProfesorId == user.ProfesorId(), ct);
            if (e is null) return Results.NotFound();
            var intentos = await db.Intentos.Where(i => i.EvaluacionId == id && !i.EsPrueba)
                .Include(i => i.Estudiante).Include(i => i.Mensajes).ToListAsync(ct);
            var preguntas = e.Preguntas.ToDictionary(p => p.Id);
            var lista = intentos.SelectMany(i => i.Mensajes
                .Where(m => m.Rol == "estudiante" && m.PreguntaId is { } pid && preguntas.ContainsKey(pid))
                .Select(m => new ConsultaEstudiante(preguntas[m.PreguntaId!.Value].Orden, preguntas[m.PreguntaId!.Value].Enunciado,
                    i.Estudiante is null ? $"intento {i.Id}" : Dtos.NombreEstudiante(i.Estudiante), m.Texto))).ToList();
            return Results.Ok(await analista.AnalizarAsync(e.Titulo, lista, ct));
        });
    }

    private static string Recortar(string texto) => texto.Length <= MaximoTextoMaterial ? texto : texto[..MaximoTextoMaterial] + "\n[…material recortado por extensión]";
}
