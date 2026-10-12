using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace MetisCurriculum.Api.Domain.Ia;

/// Extrae texto de los archivos que sube el profesor. Los PDF no se convierten: se envían tal cual a Claude,
/// que lee el documento completo (texto, tablas e imágenes).
public static partial class LectorArchivos
{
    public const long TamanoMaximo = 15 * 1024 * 1024;

    public static readonly Dictionary<string, string> Tipos = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".txt"] = "text/plain",
        [".md"] = "text/markdown",
        [".csv"] = "text/csv",
    };

    public static bool EsPdf(string? tipo) => tipo == "application/pdf";

    /// Texto del archivo, o null si es un PDF (va como documento) o un formato no soportado.
    public static string? ExtraerTexto(string nombre, byte[] datos)
    {
        var ext = Path.GetExtension(nombre).ToLowerInvariant();
        return ext switch
        {
            ".txt" or ".md" or ".csv" => Encoding.UTF8.GetString(datos),
            ".docx" => DesdeOfficeXml(datos, e => e.StartsWith("word/document.xml") || e.StartsWith("word/footnotes.xml"), "p"),
            ".pptx" => DesdeOfficeXml(datos, e => DiapositivaRegex().IsMatch(e), "p"),
            _ => null,
        };
    }

    // Word y PowerPoint son ZIP con XML: se toma el texto de cada párrafo (w:p / a:p).
    private static string DesdeOfficeXml(byte[] datos, Func<string, bool> incluir, string parrafo)
    {
        using var zip = new ZipArchive(new MemoryStream(datos), ZipArchiveMode.Read);
        var sb = new StringBuilder();
        var entradas = zip.Entries.Where(e => incluir(e.FullName))
            .OrderBy(e => DiapositivaRegex().Match(e.FullName) is { Success: true } m ? int.Parse(m.Groups[1].Value) : 0);
        foreach (var entrada in entradas)
        {
            using var s = entrada.Open();
            var xml = XDocument.Load(s);
            if (entrada.FullName.StartsWith("ppt/")) sb.AppendLine($"--- Diapositiva {DiapositivaRegex().Match(entrada.FullName).Groups[1].Value} ---");
            foreach (var p in xml.Descendants().Where(x => x.Name.LocalName == parrafo))
            {
                var texto = string.Concat(p.Descendants().Where(x => x.Name.LocalName == "t").Select(x => x.Value)).Trim();
                if (texto.Length > 0) sb.AppendLine(texto);
            }
        }
        return sb.ToString().Trim();
    }

    [GeneratedRegex(@"^ppt/slides/slide(\d+)\.xml$")]
    private static partial Regex DiapositivaRegex();
}
