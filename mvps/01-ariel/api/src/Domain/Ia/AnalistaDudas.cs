using System.Text;
using System.Text.Json;

namespace MetisCurriculum.Api.Domain.Ia;

public record ConsultaEstudiante(int PreguntaOrden, string Enunciado, string Estudiante, string Texto);
public record DudaFrecuente(int? Pregunta, string Duda, int Estudiantes, string Sugerencia);
public record ResumenDudas(string Resumen, List<DudaFrecuente> Dudas, bool PorIa);

/// Identifica las dudas frecuentes de un curso a partir de lo que los estudiantes le preguntaron a Metis.
public class AnalistaDudas(ClienteIa ia)
{
    private const string Sistema = """
        Analizas las consultas que estudiantes de un curso le hicieron a Metis (asistente de estudio) durante una evaluación.
        Tu lector es el profesor: quiere saber qué no se entendió para reforzarlo en clases.
        - Agrupa las consultas en dudas de fondo (conceptos o habilidades), no en frases literales. Ignora saludos y pedidos de la respuesta sin contenido.
        - Para cada duda indica el número de la pregunta (o null si es transversal), cuántos estudiantes distintos la tuvieron y una sugerencia concreta y breve para la clase.
        - Ordena de la más a la menos frecuente. Máximo 6 dudas.
        - "resumen": dos o tres oraciones con el panorama general, en español de Chile. No nombres a los estudiantes.
        """;

    private static readonly object Esquema = new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "resumen", "dudas" },
        properties = new
        {
            resumen = new { type = "string" },
            dudas = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    additionalProperties = false,
                    required = new[] { "pregunta", "duda", "estudiantes", "sugerencia" },
                    properties = new
                    {
                        pregunta = new { type = new[] { "integer", "null" } },
                        duda = new { type = "string" },
                        estudiantes = new { type = "integer" },
                        sugerencia = new { type = "string" },
                    },
                },
            },
        },
    };

    public async Task<ResumenDudas> AnalizarAsync(string evaluacion, List<ConsultaEstudiante> consultas, CancellationToken ct)
    {
        if (consultas.Count == 0) return new ResumenDudas("Todavía no hay consultas a Metis en esta evaluación.", [], false);
        if (ia.Disponible)
        {
            // Los nombres se reemplazan por un código: el modelo solo necesita distinguir estudiantes.
            var codigos = consultas.Select(c => c.Estudiante).Distinct().Select((e, i) => (e, i)).ToDictionary(x => x.e, x => $"E{x.i + 1}");
            var sb = new StringBuilder($"Evaluación: {evaluacion}\n\n");
            foreach (var g in consultas.GroupBy(c => (c.PreguntaOrden, c.Enunciado)).OrderBy(g => g.Key.PreguntaOrden))
            {
                sb.AppendLine($"Pregunta {g.Key.PreguntaOrden}: {g.Key.Enunciado}");
                foreach (var c in g) sb.AppendLine($"- [{codigos[c.Estudiante]}] {c.Texto}");
                sb.AppendLine();
            }
            var json = await ia.JsonAsync(Sistema, [ClienteIa.Texto(sb.ToString())], Esquema, "medium", 8000, ct: ct);
            if (json is { } j)
            {
                var dudas = j.GetProperty("dudas").EnumerateArray().Select(d => new DudaFrecuente(
                    d.GetProperty("pregunta").ValueKind == JsonValueKind.Number ? d.GetProperty("pregunta").GetInt32() : null,
                    d.GetProperty("duda").GetString() ?? "", d.GetProperty("estudiantes").GetInt32(),
                    d.GetProperty("sugerencia").GetString() ?? "")).ToList();
                return new ResumenDudas(j.GetProperty("resumen").GetString() ?? "", dudas, true);
            }
        }

        // Sin IA: preguntas que más consultas recibieron, con la cantidad de estudiantes.
        var porPregunta = consultas.GroupBy(c => (c.PreguntaOrden, c.Enunciado))
            .Select(g => new DudaFrecuente(g.Key.PreguntaOrden, $"Consultas sobre: {g.Key.Enunciado}",
                g.Select(c => c.Estudiante).Distinct().Count(), "Revisa las conversaciones de esta pregunta para ver qué no quedó claro."))
            .OrderByDescending(d => d.Estudiantes).Take(6).ToList();
        return new ResumenDudas(
            $"{consultas.Select(c => c.Estudiante).Distinct().Count()} estudiantes hicieron {consultas.Count} consultas a Metis. Con la IA activada verás aquí las dudas agrupadas por concepto.",
            porPregunta, false);
    }
}
