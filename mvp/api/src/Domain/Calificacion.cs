namespace MetisCurriculum.Api.Domain;

public static class Calificacion
{
    public static string CodigoOficial(string asignatura, string nivelMineduc, int numero) => $"{asignatura}{nivelMineduc} OA {numero:00}";

    /// Escala chilena 1,0 a 7,0 con exigencia (por defecto 60% para el 4,0), redondeada a un decimal.
    public static decimal Nota(decimal puntaje, decimal maximo, int exigencia = 60)
    {
        if (maximo <= 0) return 1.0m;
        var p = Math.Clamp(puntaje, 0, maximo);
        var corte = maximo * exigencia / 100m;
        var nota = p < corte
            ? 1m + 3m * p / corte
            : 4m + 3m * (p - corte) / (maximo - corte == 0 ? 1 : maximo - corte);
        return Math.Round(Math.Clamp(nota, 1m, 7m), 1, MidpointRounding.AwayFromZero);
    }

    /// Nivel de logro según porcentaje: L (≥80%), ML (60–79%), PL (&lt;60%).
    public static string NivelLogro(decimal porcentaje) => porcentaje >= 80 ? "Logrado" : porcentaje >= 60 ? "Medianamente logrado" : "Por lograr";

    /// Puntaje automático de una pregunta cerrada. Las abiertas quedan en null (revisión docente).
    public static decimal? Corregir(Pregunta p, RespuestaPregunta? r)
    {
        if (p.Tipo == TipoPregunta.Abierta) return string.IsNullOrWhiteSpace(r?.Texto) ? 0 : null;
        var sel = r?.Seleccion.Distinct().ToList() ?? [];
        if (sel.Count == 0) return 0;
        if (p.Tipo is TipoPregunta.Unica or TipoPregunta.VerdaderoFalso)
            return sel.Count == 1 && p.Correctas.Contains(sel[0]) ? p.Puntaje : 0;

        // Selección múltiple: aciertos menos errores, proporcional y nunca negativo.
        var aciertos = sel.Count(p.Correctas.Contains);
        var errores = sel.Count - aciertos;
        var neto = Math.Max(0, aciertos - errores);
        return p.Correctas.Count == 0 ? 0 : Math.Round(p.Puntaje * neto / p.Correctas.Count, 2);
    }

    /// Recalcula puntaje, nota y estado de revisión de un intento entregado.
    public static void Recalcular(Intento intento, IReadOnlyList<Pregunta> preguntasDelIntento, int exigencia)
    {
        intento.PuntajeMaximo = preguntasDelIntento.Sum(p => p.Puntaje);
        intento.RevisionPendiente = intento.Respuestas.Any(r => r.Puntaje is null);
        intento.PuntajeObtenido = intento.Respuestas.Sum(r => r.Puntaje ?? 0);
        intento.Nota = intento.RevisionPendiente ? null : Nota(intento.PuntajeObtenido.Value, intento.PuntajeMaximo, exigencia);
    }
}
