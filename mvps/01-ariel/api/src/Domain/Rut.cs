namespace MetisCurriculum.Api.Domain;

/// RUT chileno: normaliza a "12345678-9" y valida el dígito verificador (módulo 11).
public static class Rut
{
    public static string? Normalizar(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var limpio = new string(input.Where(c => char.IsDigit(c) || c is 'k' or 'K').ToArray()).ToUpperInvariant();
        if (limpio.Length < 2) return null;
        var cuerpo = limpio[..^1];
        var dv = limpio[^1];
        if (!cuerpo.All(char.IsDigit) || cuerpo.Length > 8) return null;
        return DigitoVerificador(cuerpo) == dv ? $"{cuerpo.TrimStart('0')}-{dv}" : null;
    }

    public static char DigitoVerificador(string cuerpo)
    {
        int suma = 0, factor = 2;
        for (var i = cuerpo.Length - 1; i >= 0; i--)
        {
            suma += (cuerpo[i] - '0') * factor;
            factor = factor == 7 ? 2 : factor + 1;
        }
        var resto = 11 - suma % 11;
        return resto switch { 11 => '0', 10 => 'K', _ => (char)('0' + resto) };
    }
}
