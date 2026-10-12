using System.Text.Json;
using Anthropic.Models.Beta.Messages;

namespace MetisCurriculum.Api.Domain.Ia;

public record OaParaIa(int Id, string Codigo, string Descripcion, string? Eje);
public record MaterialParaIa(string Titulo, string? Texto, byte[]? Pdf);

public record SolicitudGeneracion(
    string Asignatura, string Nivel, string? Consigna, List<OaParaIa> Oas, List<MaterialParaIa> Materiales,
    int Cantidad, string Dificultad, List<TipoPregunta> Tipos, TipoEvaluacion TipoEvaluacion, bool ApoyosTea);

public record PreguntaGenerada(
    TipoPregunta Tipo, string Enunciado, List<string> Opciones, List<int> Correctas, decimal Puntaje,
    int? ObjetivoId, string? PistaDocente, string? Justificacion, string? Fuente);

public record EvaluacionGenerada(string Titulo, string Instrucciones, List<PreguntaGenerada> Preguntas, bool PorIa, string? Aviso);

/// Genera el esquema de una evaluación a partir de los OA del curso, la consigna del profesor y sus materiales.
/// El resultado es un borrador: el profesor lo revisa y edita antes de crear la evaluación.
public class GeneradorEvaluaciones(ClienteIa ia)
{
    public const int MaximoPreguntas = 30;

    private const string Sistema = """
        Eres el generador de evaluaciones de Metis, una plataforma para profesores de colegios en Chile.
        Creas evaluaciones alineadas a los Objetivos de Aprendizaje (OA) de las Bases Curriculares del MINEDUC.

        Cómo trabajas:
        - Cada pregunta evalúa uno de los OA entregados: indica su código exacto en el campo "oa". Reparte las preguntas entre los OA.
        - Si hay materiales del profesor, las preguntas se basan en ellos y "fuente" cita el material y la parte de donde sale (por ejemplo "Guía de la célula, p. 3: «La membrana regula…»"). Sin materiales, "fuente" indica el OA.
        - El nivel de lenguaje corresponde al curso. Usa español de Chile, claro y sin ambigüedades.
        - Selección única: 4 alternativas plausibles con una sola correcta. Selección múltiple: 4 o 5 alternativas con 2 o más correctas. Verdadero o falso: "opciones" vacío y "correctas" [0] si es verdadero o [1] si es falso. Abierta: "opciones" y "correctas" vacíos.
        - "correctas" usa índices desde 0 sobre "opciones".
        - "justificacion" explica al profesor por qué la respuesta es correcta y, en abiertas, qué debe contener una buena respuesta (pauta breve).
        - "pista" es una pista para el estudiante que lo ayuda a pensar sin revelar la respuesta. El asistente Metis la usa cuando el estudiante pide ayuda.
        - "puntaje": 1 en selección y verdadero o falso; 2 a 4 en abiertas, según su complejidad.
        - Evita preguntas que dependan de imágenes que el estudiante no verá.
        - Si se pide considerar estudiantes con TEA: enunciados cortos y literales, una idea por pregunta, sin dobles negaciones ni ironías.
        - El título es breve y descriptivo. Las instrucciones se dirigen al estudiante en dos o tres oraciones.
        """;

    private static readonly object Esquema = new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "titulo", "instrucciones", "preguntas" },
        properties = new
        {
            titulo = new { type = "string" },
            instrucciones = new { type = "string" },
            preguntas = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    additionalProperties = false,
                    required = new[] { "tipo", "enunciado", "opciones", "correctas", "puntaje", "oa", "pista", "justificacion", "fuente" },
                    properties = new
                    {
                        tipo = new { type = "string", @enum = new[] { "unica", "multiple", "verdadero_falso", "abierta" } },
                        enunciado = new { type = "string" },
                        opciones = new { type = "array", items = new { type = "string" } },
                        correctas = new { type = "array", items = new { type = "integer" } },
                        puntaje = new { type = "number" },
                        oa = new { type = "string" },
                        pista = new { type = "string" },
                        justificacion = new { type = "string" },
                        fuente = new { type = "string" },
                    },
                },
            },
        },
    };

    private static readonly Dictionary<TipoPregunta, string> NombreTipo = new()
    {
        [TipoPregunta.Unica] = "selección única", [TipoPregunta.Multiple] = "selección múltiple",
        [TipoPregunta.VerdaderoFalso] = "verdadero o falso", [TipoPregunta.Abierta] = "abierta",
    };

    public async Task<EvaluacionGenerada> GenerarAsync(SolicitudGeneracion s, CancellationToken ct)
    {
        if (!ia.Disponible)
            return Ejemplo(s, "La IA no está configurada (falta ANTHROPIC_API_KEY en el servidor). Te dejamos un esquema de ejemplo armado desde los OA para que lo edites.");

        var contenido = new List<BetaContentBlockParam>();
        foreach (var m in s.Materiales.Where(m => m.Pdf is not null))
            contenido.Add(ClienteIa.Pdf(m.Pdf!, m.Titulo));
        contenido.Add(ClienteIa.Texto(Pedido(s)));

        var json = await ia.JsonAsync(Sistema, contenido, Esquema, "high", 16000, ct: ct);
        if (json is null)
            return Ejemplo(s, "No pudimos generar la evaluación con IA en este momento. Te dejamos un esquema de ejemplo armado desde los OA; puedes editarlo o volver a intentarlo.");

        var porCodigo = s.Oas.ToDictionary(o => Normalizar(o.Codigo), o => o.Id);
        var preguntas = new List<PreguntaGenerada>();
        foreach (var p in json.Value.GetProperty("preguntas").EnumerateArray())
        {
            if (Convertir(p, porCodigo) is { } pregunta) preguntas.Add(pregunta);
        }
        if (preguntas.Count == 0)
            return Ejemplo(s, "La IA no devolvió preguntas válidas. Te dejamos un esquema de ejemplo armado desde los OA.");

        return new EvaluacionGenerada(
            Texto(json.Value, "titulo") ?? $"Evaluación de {s.Asignatura}",
            Texto(json.Value, "instrucciones") ?? "Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.",
            preguntas.Take(MaximoPreguntas).ToList(), true, null);
    }

    private static string Pedido(SolicitudGeneracion s)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Curso: {s.Nivel}. Asignatura: {s.Asignatura}.");
        sb.AppendLine($"Evaluación {(s.TipoEvaluacion == TipoEvaluacion.Formativa ? "formativa" : "sumativa")} de {s.Cantidad} preguntas, dificultad {s.Dificultad}.");
        sb.AppendLine($"Tipos de pregunta permitidos: {string.Join(", ", s.Tipos.Select(t => NombreTipo[t]))}.");
        if (s.ApoyosTea) sb.AppendLine("El curso tiene estudiantes con TEA: aplica las pautas de lenguaje claro.");
        sb.AppendLine();
        sb.AppendLine("Objetivos de Aprendizaje a evaluar:");
        foreach (var o in s.Oas) sb.AppendLine($"- {o.Codigo}{(o.Eje is null ? "" : $" (eje {o.Eje})")}: {o.Descripcion}");
        foreach (var m in s.Materiales.Where(m => m.Texto is not null))
        {
            sb.AppendLine();
            sb.AppendLine($"<material titulo=\"{m.Titulo}\">");
            sb.AppendLine(m.Texto);
            sb.AppendLine("</material>");
        }
        if (s.Materiales.Any(m => m.Pdf is not null)) sb.AppendLine("\nLos documentos PDF adjuntos también son materiales del profesor.");
        if (!string.IsNullOrWhiteSpace(s.Consigna))
        {
            sb.AppendLine();
            sb.AppendLine("Indicaciones del profesor:");
            sb.AppendLine(s.Consigna.Trim());
        }
        return sb.ToString();
    }

    private static PreguntaGenerada? Convertir(JsonElement p, Dictionary<string, int> porCodigo)
    {
        var tipo = Texto(p, "tipo") switch
        {
            "unica" => TipoPregunta.Unica, "multiple" => TipoPregunta.Multiple,
            "verdadero_falso" => TipoPregunta.VerdaderoFalso, "abierta" => TipoPregunta.Abierta, _ => (TipoPregunta?)null,
        };
        var enunciado = Texto(p, "enunciado");
        if (tipo is null || enunciado is null) return null;
        var opciones = p.TryGetProperty("opciones", out var o) ? o.EnumerateArray().Select(x => x.GetString()?.Trim() ?? "").Where(x => x.Length > 0).ToList() : [];
        var correctas = p.TryGetProperty("correctas", out var c) ? c.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => x.GetInt32()).Distinct().Order().ToList() : [];

        switch (tipo)
        {
            case TipoPregunta.VerdaderoFalso:
                opciones = ["Verdadero", "Falso"];
                if (correctas is not ([0] or [1])) return null;
                break;
            case TipoPregunta.Abierta:
                opciones = []; correctas = [];
                break;
            default:
                if (opciones.Count < 2 || correctas.Count == 0 || correctas.Any(i => i < 0 || i >= opciones.Count)) return null;
                if (tipo == TipoPregunta.Unica && correctas.Count != 1) return null;
                break;
        }
        var puntaje = p.TryGetProperty("puntaje", out var pt) && pt.TryGetDecimal(out var d) ? Math.Clamp(Math.Round(d * 2) / 2, 0.5m, 20m) : 1m;
        int? oaId = Texto(p, "oa") is { } cod && porCodigo.TryGetValue(Normalizar(cod), out var id) ? id : null;
        return new PreguntaGenerada(tipo.Value, enunciado, opciones, correctas, puntaje, oaId, Texto(p, "pista"), Texto(p, "justificacion"), Texto(p, "fuente"));
    }

    // Sin IA: una pregunta abierta por OA (hasta la cantidad pedida), para que el flujo se pueda probar y editar.
    private static EvaluacionGenerada Ejemplo(SolicitudGeneracion s, string aviso)
    {
        var preguntas = new List<PreguntaGenerada>();
        for (var i = 0; i < s.Cantidad && s.Oas.Count > 0; i++)
        {
            var oa = s.Oas[i % s.Oas.Count];
            var foco = oa.Descripcion.Split(['\n', ':'])[0].TrimEnd('.');
            preguntas.Add(new PreguntaGenerada(TipoPregunta.Abierta,
                i < s.Oas.Count ? $"Explica con tus palabras y con un ejemplo: {MinusculaInicial(foco)}." : $"Da otro ejemplo distinto relacionado con: {MinusculaInicial(foco)}.",
                [], [], 2, oa.Id, "Piensa en algo que hayas visto en clases o en tu vida diaria.",
                "Pregunta de ejemplo: escribe la pauta de corrección.", oa.Codigo));
        }
        return new EvaluacionGenerada($"Evaluación de {s.Asignatura}", "Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.", preguntas, false, aviso);
    }

    private static string? Texto(JsonElement e, string prop) =>
        e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String && v.GetString()!.Trim() is { Length: > 0 } t ? t : null;

    private static string Normalizar(string codigo) => new(codigo.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static string MinusculaInicial(string s) => s.Length == 0 ? s : char.ToLowerInvariant(s[0]) + s[1..];
}
