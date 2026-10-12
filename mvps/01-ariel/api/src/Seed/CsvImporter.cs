using System.Text;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Seed;

public record ImportResultado(int Creados, int Actualizados, List<string> Errores, int AsignaturasCreadas = 0);

/// Importa OA desde CSV (separador coma, comillas dobles opcionales).
/// Columnas mínimas: asignatura,nivel,numero,eje,descripcion (en ese orden si no hay encabezado).
/// Con encabezado, las columnas se leen por nombre y se aceptan además:
///   asignatura_nombre, prefijo, area, fuente.
/// asignatura = código en Metis (LE, LL, MA…) o nombre exacto; nivel = 1B..8B, 1M..4M.
/// Si la asignatura no existe y viene asignatura_nombre, se crea.
public static class CsvImporter
{
    // Colores de las asignaturas más usadas; el resto toma uno de la paleta.
    private static readonly Dictionary<string, string> Colores = new(StringComparer.OrdinalIgnoreCase)
    {
        ["LE"] = "#c2410c", ["LL"] = "#c2410c", ["MA"] = "#1d4ed8", ["CN"] = "#15803d", ["HI"] = "#7e22ce",
        ["IN"] = "#0e7490", ["AR"] = "#be185d", ["MU"] = "#a16207", ["EF"] = "#b91c1c", ["TE"] = "#475569",
        ["OR"] = "#0f766e", ["EC"] = "#6d28d9", ["FI"] = "#4338ca", ["ARE"] = "#be185d", ["MUE"] = "#a16207", ["EFE"] = "#b91c1c",
    };
    private static readonly string[] Paleta = ["#0369a1", "#9333ea", "#65a30d", "#d97706", "#db2777", "#0d9488", "#4f46e5", "#ea580c", "#16a34a", "#9f1239"];

    private static readonly string[] PorDefecto = ["asignatura", "nivel", "numero", "eje", "descripcion"];

    public static async Task<ImportResultado> ImportarAsync(AppDb db, string csv)
    {
        var asignaturas = await db.Asignaturas.ToListAsync();
        var niveles = await db.Niveles.ToListAsync();
        var existentes = await db.Objetivos.ToDictionaryAsync(o => (o.AsignaturaId, o.NivelId, o.Numero));
        int creados = 0, actualizados = 0, asignaturasCreadas = 0;
        var errores = new List<string>();

        var filas = Parse(csv);
        var columnas = PorDefecto.Select((c, i) => (c, i)).ToDictionary(x => x.c, x => x.i);
        var inicio = 0;
        if (filas.Count > 0 && filas[0].Count > 0 && filas[0][0].Trim().TrimStart('\uFEFF').Equals("asignatura", StringComparison.OrdinalIgnoreCase))
        {
            columnas = filas[0].Select((c, i) => (c: c.Trim().TrimStart('\uFEFF').ToLowerInvariant(), i))
                .GroupBy(x => x.c).ToDictionary(g => g.Key, g => g.First().i);
            inicio = 1;
            var faltan = new[] { "asignatura", "nivel", "numero", "descripcion" }.Where(c => !columnas.ContainsKey(c)).ToList();
            if (faltan.Count > 0) return new(0, 0, [$"Faltan columnas en el encabezado: {string.Join(", ", faltan)}"]);
        }

        for (var i = inicio; i < filas.Count; i++)
        {
            var f = filas[i];
            var linea = i + 1;
            if (f.All(string.IsNullOrWhiteSpace)) continue;
            string? Col(string nombre) => columnas.TryGetValue(nombre, out var k) && k < f.Count && !string.IsNullOrWhiteSpace(f[k]) ? f[k].Trim() : null;

            var nivel = niveles.FirstOrDefault(n => n.Codigo.Equals(Col("nivel") ?? "", StringComparison.OrdinalIgnoreCase));
            if (nivel is null) { errores.Add($"Línea {linea}: nivel desconocido '{Col("nivel")}'"); continue; }
            if (!int.TryParse((Col("numero") ?? "").ToUpperInvariant().Replace("OA", ""), out var numero) || numero <= 0)
            { errores.Add($"Línea {linea}: número de OA inválido '{Col("numero")}'"); continue; }
            var descripcion = Col("descripcion")?.Replace("\r\n", "\n");
            if (descripcion is null) { errores.Add($"Línea {linea}: descripción vacía"); continue; }

            var textoAsig = Col("asignatura") ?? "";
            var codigo = textoAsig.ToUpperInvariant() switch { "LEN" => "LE", "MAT" => "MA", "HIS" => "HI", var c => c };
            var nombreAsig = Col("asignatura_nombre");
            // Si el CSV trae asignatura_nombre, la primera columna es siempre el código (dos asignaturas pueden llamarse igual en distintas áreas).
            var asig = asignaturas.FirstOrDefault(a => a.Codigo.Equals(codigo, StringComparison.OrdinalIgnoreCase))
                ?? (nombreAsig is null ? asignaturas.FirstOrDefault(a => a.Nombre.Equals(textoAsig, StringComparison.OrdinalIgnoreCase)) : null);
            if (asig is null && nombreAsig is not null && codigo.Length is > 0 and <= 10)
            {
                asig = new Asignatura
                {
                    Codigo = codigo, Nombre = nombreAsig, Prefijo = Col("prefijo"), Area = Col("area"),
                    Color = Colores.GetValueOrDefault(codigo) ?? Paleta[asignaturas.Count % Paleta.Length],
                };
                db.Asignaturas.Add(asig);
                await db.SaveChangesAsync();
                asignaturas.Add(asig);
                asignaturasCreadas++;
            }
            else if (asig is not null)
            {
                // Completa datos que las asignaturas base no traen (prefijo oficial y área).
                if (Col("prefijo") is { } pre && pre != asig.Codigo && asig.Prefijo is null) asig.Prefijo = pre;
                if (Col("area") is { } area && asig.Area is null) asig.Area = area;
            }
            if (asig is null) { errores.Add($"Línea {linea}: asignatura desconocida '{textoAsig}' (agrega la columna asignatura_nombre para crearla)"); continue; }
            var eje = Col("eje");
            var fuente = Col("fuente");

            if (existentes.TryGetValue((asig.Id, nivel.Id, numero), out var oa))
            {
                if (oa.Descripcion != descripcion || oa.Eje != eje || (fuente is not null && oa.Fuente != fuente))
                {
                    oa.Descripcion = descripcion; oa.Eje = eje; oa.Fuente = fuente ?? oa.Fuente; actualizados++;
                }
            }
            else
            {
                oa = new ObjetivoAprendizaje { AsignaturaId = asig.Id, NivelId = nivel.Id, Numero = numero, Eje = eje, Descripcion = descripcion, Fuente = fuente };
                db.Objetivos.Add(oa);
                existentes[(asig.Id, nivel.Id, numero)] = oa;
                creados++;
            }
        }

        await db.SaveChangesAsync();
        return new ImportResultado(creados, actualizados, errores, asignaturasCreadas);
    }

    private static List<List<string>> Parse(string csv)
    {
        var filas = new List<List<string>>();
        var fila = new List<string>();
        var campo = new StringBuilder();
        var enComillas = false;

        for (var i = 0; i < csv.Length; i++)
        {
            var c = csv[i];
            if (enComillas)
            {
                if (c == '"' && i + 1 < csv.Length && csv[i + 1] == '"') { campo.Append('"'); i++; }
                else if (c == '"') enComillas = false;
                else campo.Append(c);
            }
            else if (c == '"') enComillas = true;
            else if (c == ',') { fila.Add(campo.ToString()); campo.Clear(); }
            else if (c == '\n')
            {
                fila.Add(campo.ToString()); campo.Clear();
                filas.Add(fila); fila = [];
            }
            else if (c != '\r') campo.Append(c);
        }
        if (campo.Length > 0 || fila.Count > 0) { fila.Add(campo.ToString()); filas.Add(fila); }
        return filas;
    }
}
