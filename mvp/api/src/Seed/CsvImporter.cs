using System.Text;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Seed;

public record ImportResultado(int Creados, int Actualizados, List<string> Errores);

/// Importa OAs desde CSV (separador coma, comillas dobles opcionales).
/// Encabezado: asignatura,nivel,numero,eje,descripcion
/// asignatura = código (LEN, MAT, CN, HIS) o nombre exacto; nivel = código (1B..8B, 1M..4M).
public static class CsvImporter
{
    public static async Task<ImportResultado> ImportarAsync(AppDb db, string csv)
    {
        var asignaturas = await db.Asignaturas.ToListAsync();
        var niveles = await db.Niveles.ToListAsync();
        var existentes = await db.Objetivos.ToDictionaryAsync(o => (o.AsignaturaId, o.NivelId, o.Numero));
        int creados = 0, actualizados = 0;
        var errores = new List<string>();

        var filas = Parse(csv);
        for (var i = 0; i < filas.Count; i++)
        {
            var f = filas[i];
            var linea = i + 1;
            if (i == 0 && f.Count > 0 && f[0].Trim().Equals("asignatura", StringComparison.OrdinalIgnoreCase)) continue;
            if (f.All(string.IsNullOrWhiteSpace)) continue;
            if (f.Count < 5) { errores.Add($"Línea {linea}: se esperaban 5 columnas"); continue; }

            var asig = asignaturas.FirstOrDefault(a =>
                a.Codigo.Equals(f[0].Trim(), StringComparison.OrdinalIgnoreCase) ||
                a.Nombre.Equals(f[0].Trim(), StringComparison.OrdinalIgnoreCase));
            var nivel = niveles.FirstOrDefault(n => n.Codigo.Equals(f[1].Trim(), StringComparison.OrdinalIgnoreCase));
            if (asig is null) { errores.Add($"Línea {linea}: asignatura desconocida '{f[0]}'"); continue; }
            if (nivel is null) { errores.Add($"Línea {linea}: nivel desconocido '{f[1]}'"); continue; }
            if (!int.TryParse(f[2].Trim().ToUpperInvariant().Replace("OA", ""), out var numero) || numero <= 0)
            { errores.Add($"Línea {linea}: número de OA inválido '{f[2]}'"); continue; }
            var descripcion = f[4].Trim();
            if (descripcion.Length == 0) { errores.Add($"Línea {linea}: descripción vacía"); continue; }
            var eje = string.IsNullOrWhiteSpace(f[3]) ? null : f[3].Trim();

            if (existentes.TryGetValue((asig.Id, nivel.Id, numero), out var oa))
            {
                if (oa.Descripcion != descripcion || oa.Eje != eje)
                {
                    oa.Descripcion = descripcion; oa.Eje = eje; actualizados++;
                }
            }
            else
            {
                oa = new ObjetivoAprendizaje { AsignaturaId = asig.Id, NivelId = nivel.Id, Numero = numero, Eje = eje, Descripcion = descripcion };
                db.Objetivos.Add(oa);
                existentes[(asig.Id, nivel.Id, numero)] = oa;
                creados++;
            }
        }

        await db.SaveChangesAsync();
        return new ImportResultado(creados, actualizados, errores);
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
