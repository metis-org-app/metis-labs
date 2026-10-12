using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace MetisCurriculum.Api.Domain;

/// Asistente Metis embebido en la evaluación. Guía al estudiante sin darle la respuesta.
/// Esta versión usa reglas pedagógicas; la interfaz está pensada para reemplazarla por un modelo
/// (servicio metis-agents) sin cambiar el contrato con la vista del estudiante.
public static partial class AsistenteMetis
{
    public record Contexto(
        Pregunta Pregunta,
        ObjetivoAprendizaje? Objetivo,
        string? CodigoOa,
        int NivelMaximo,
        bool Activo,
        string? InstruccionesDocente,
        int AyudasPrevias,
        bool LenguajeClaro,
        string NombreEstudiante);

    public record Respuesta(string Texto, int? Nivel);

    private static readonly string[] PideRespuesta = ["respuesta", "cual es", "cuál es", "dime", "correcta", "solucion", "solución", "resuelve", "resuélvelo", "cuál marco", "cual marco", "qué marco", "que marco"];
    private static readonly string[] Saludo = ["hola", "buenas", "buenos dias", "buenos días", "buenas tardes"];
    private static readonly string[] Agradece = ["gracias", "listo", "entendí", "entendi", "ya entendí", "ok"];

    public static Respuesta Responder(Contexto c, string mensaje)
    {
        var m = Normalizar(mensaje);
        var nombre = c.NombreEstudiante.Split(' ')[0];

        if (!c.Activo || !c.Pregunta.AsistenteHabilitado)
            return new("En esta pregunta tu profesor pidió que trabajes sin ayuda. Lee con calma y confía en lo que sabes.", null);

        if (Saludo.Any(s => m.StartsWith(Normalizar(s))) && m.Length < 25)
            return new($"¡Hola, {nombre}! Estoy aquí para ayudarte a pensar, no para darte las respuestas. ¿Qué parte de la pregunta {c.Pregunta.Orden} te cuesta?", null);

        if (Agradece.Any(s => m.Contains(Normalizar(s))) && m.Length < 30)
            return new("¡Bien! Cuando tengas tu respuesta, márcala o escríbela. Si vuelves a dudar, aquí estoy.", null);

        // Escalamiento: cada ayuda en la misma pregunta sube un nivel, hasta el máximo que definió el profesor.
        if (c.AyudasPrevias >= c.NivelMaximo && !PideRespuesta.Any(p => m.Contains(Normalizar(p))))
            return new("Ya te di todas las pistas que tengo para esta pregunta. Vuelve a leerlas con calma y elige tu respuesta: equivocarse también es parte de aprender.", null);
        var nivel = Math.Min(c.NivelMaximo, 1 + c.AyudasPrevias);
        var sb = new StringBuilder();
        if (PideRespuesta.Any(p => m.Contains(Normalizar(p))))
            sb.Append("No puedo decirte la respuesta, pero sí ayudarte a encontrarla. ");

        var pasos = nivel switch
        {
            1 => Nivel1(c),
            2 => Nivel2(c),
            _ => Nivel3(c),
        };

        if (c.LenguajeClaro)
        {
            // Lenguaje claro y literal, en pasos numerados (apoyo para estudiantes TEA).
            sb.Append("Vamos paso a paso:");
            for (var i = 0; i < pasos.Count; i++) sb.Append($"\n{i + 1}. {pasos[i]}");
        }
        else
        {
            sb.Append(string.Join(" ", pasos));
        }

        if (nivel < c.NivelMaximo) sb.Append(c.LenguajeClaro ? "\nSi necesitas más ayuda, escríbeme otra vez." : " Si aún tienes dudas, pídeme otra pista.");
        return new(sb.ToString(), nivel);
    }

    // Nivel 1: preguntas guía.
    private static List<string> Nivel1(Contexto c)
    {
        var claves = PalabrasClave(c.Pregunta.Enunciado);
        var lista = string.Join(", ", claves.Select(k => $"«{k}»"));
        var fraseClaves = claves.Count switch
        {
            0 => "Fíjate bien en lo que te piden.",
            1 => $"La palabra importante es {lista}.",
            _ => $"Las palabras importantes son {lista}.",
        };
        return c.Pregunta.Tipo switch
        {
            TipoPregunta.Abierta =>
            [
                fraseClaves,
                "¿Qué sabes ya sobre eso? Escribe una idea en una oración.",
                "Después agrégale un ejemplo de tu vida diaria.",
            ],
            TipoPregunta.VerdaderoFalso =>
            [
                fraseClaves,
                "Pregúntate: ¿esto se cumple siempre, o hay algún caso en que no?",
            ],
            TipoPregunta.Multiple =>
            [
                fraseClaves,
                "Revisa cada alternativa por separado: ¿esta se relaciona con lo que te preguntan? Puede haber más de una correcta.",
            ],
            _ =>
            [
                fraseClaves,
                "Lee cada alternativa y pregúntate: ¿responde exactamente a lo que te piden?",
            ],
        };
    }

    // Nivel 2: pistas (la del profesor, o el objetivo de aprendizaje).
    private static List<string> Nivel2(Contexto c)
    {
        var pasos = new List<string>();
        if (!string.IsNullOrWhiteSpace(c.Pregunta.PistaDocente)) pasos.Add($"Pista de tu profesor: {c.Pregunta.PistaDocente.Trim()}");
        else if (c.Objetivo is not null) pasos.Add($"Esta pregunta es del {c.CodigoOa}: {MinusculaInicial(c.Objetivo.Descripcion)}");
        pasos.Add(c.Pregunta.Tipo switch
        {
            TipoPregunta.Abierta => "Piensa en qué ocurre, por qué ocurre y un ejemplo. Con esas tres partes tienes una buena respuesta.",
            TipoPregunta.VerdaderoFalso => "Intenta pensar en un ejemplo concreto. Si encuentras un caso en que no se cumple, la afirmación es falsa.",
            _ => "Descarta primero las alternativas que claramente no corresponden y compara las que quedan.",
        });
        return pasos;
    }

    // Nivel 3: ejemplo parcial (descarta una alternativa incorrecta o propone cómo empezar).
    private static List<string> Nivel3(Contexto c)
    {
        var pasos = Nivel2(c).Take(1).ToList();
        var p = c.Pregunta;
        switch (p.Tipo)
        {
            case TipoPregunta.Unica when p.Opciones.Count >= 3:
            {
                var incorrecta = Enumerable.Range(0, p.Opciones.Count).Where(i => !p.Correctas.Contains(i)).Last();
                pasos.Add($"Una ayuda más: la alternativa {(char)('A' + incorrecta)} ({p.Opciones[incorrecta]}) no es la correcta. Compara las que quedan.");
                break;
            }
            case TipoPregunta.Multiple:
                pasos.Add($"Una ayuda más: en esta pregunta hay {p.Correctas.Count} alternativas correctas.");
                break;
            case TipoPregunta.Abierta:
                pasos.Add("Puedes empezar así: «Esto ocurre porque…» y terminar con «Por ejemplo, …».");
                break;
            default:
                pasos.Add("Vuelve a leer la afirmación palabra por palabra. ¿Hay alguna palabra como «siempre», «solo» o «nunca» que la haga demasiado absoluta?");
                break;
        }
        return pasos;
    }

    private static readonly HashSet<string> Vacias = new(StringComparer.OrdinalIgnoreCase)
    {
        "que", "qué", "cual", "cuál", "cuales", "cuáles", "como", "cómo", "para", "por", "con", "los", "las", "una", "uno", "unos", "unas",
        "del", "de", "la", "el", "en", "y", "o", "a", "se", "su", "sus", "es", "son", "esta", "este", "estos", "estas", "entre", "sobre",
        "siguientes", "siguiente", "alternativa", "alternativas", "explica", "describe", "indica", "marca", "escribe", "nombra", "lee",
        "texto", "afirmación", "pregunta", "ejemplo", "cuando", "donde", "dónde", "porque", "también", "más", "menos", "muy", "todos", "todas",
        "usamos", "usan", "usas", "tiene", "tienen", "tienes", "puede", "pueden", "puedes", "sirve", "sirven", "hacer", "hace", "hacen", "haces",
        "necesitan", "necesita", "estos", "esas", "esos", "otra", "otro", "nuestro", "nuestra", "tus", "tu", "mis", "correcta", "correctas",
    };

    private static List<string> PalabrasClave(string enunciado) =>
        PalabraRegex().Matches(enunciado).Select(x => x.Value)
            .Where(w => w.Length > 3 && !Vacias.Contains(w))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(w => w.Length)
            .Take(3)
            .ToList();

    private static string MinusculaInicial(string s) => s.Length == 0 ? s : char.ToLower(s[0], new CultureInfo("es-CL")) + s[1..];

    private static string Normalizar(string s)
    {
        var d = s.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        return new string(d.Where(ch => CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark).ToArray());
    }

    [GeneratedRegex(@"[\p{L}]+")]
    private static partial Regex PalabraRegex();
}
