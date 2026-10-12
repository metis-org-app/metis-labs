using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record LogroOa(int ObjetivoId, decimal Obtenido, decimal Maximo)
{
    public decimal Porcentaje => Maximo == 0 ? 0 : Math.Round(100 * Obtenido / Maximo, 0);
    public string Nivel => Calificacion.NivelLogro(Porcentaje);
}

/// Logro por OA a partir de las respuestas corregidas de evaluaciones entregadas (sin vistas previas).
public static class Logro
{
    public static async Task<Dictionary<int, LogroOa>> PorOaAsync(AppDb db, int? cursoId = null, int? estudianteId = null, int? evaluacionId = null)
    {
        var intentos = db.Intentos.Where(i => i.EntregadoEn != null && !i.EsPrueba);
        if (cursoId is not null) intentos = intentos.Where(i => i.Evaluacion.CursoId == cursoId);
        if (estudianteId is not null) intentos = intentos.Where(i => i.EstudianteId == estudianteId);
        if (evaluacionId is not null) intentos = intentos.Where(i => i.EvaluacionId == evaluacionId);

        var lista = await intentos.Select(i => new { i.EvaluacionId, i.Respuestas }).ToListAsync();
        var evalIds = lista.Select(i => i.EvaluacionId).Distinct().ToList();
        var preguntas = await db.Preguntas.Where(p => evalIds.Contains(p.EvaluacionId) && p.ObjetivoId != null)
            .ToDictionaryAsync(p => p.Id);

        var acumulado = new Dictionary<int, (decimal Obt, decimal Max)>();
        foreach (var r in lista.SelectMany(i => i.Respuestas))
        {
            if (r.Puntaje is null || !preguntas.TryGetValue(r.PreguntaId, out var p)) continue;
            var oa = p.ObjetivoId!.Value;
            var (obt, max) = acumulado.GetValueOrDefault(oa);
            acumulado[oa] = (obt + r.Puntaje.Value, max + p.Puntaje);
        }
        return acumulado.ToDictionary(kv => kv.Key, kv => new LogroOa(kv.Key, kv.Value.Obt, kv.Value.Max));
    }
}
