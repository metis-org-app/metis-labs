using MetisCurriculum.Api.Domain;

namespace MetisCurriculum.Api.Endpoints;

public record CursoRef(int Id, string Nombre, int Anio);

public record OaDto(
    int Id, string Codigo, string CodigoOficial, int Numero, string? Eje, string Descripcion,
    int AsignaturaId, string Asignatura, string AsignaturaCodigo, string AsignaturaColor,
    int NivelId, string Nivel, int NivelOrden)
{
    public IEnumerable<CursoRef>? Cursos { get; init; }
}

/// Proyecciones comunes. Requieren Asignatura y Nivel cargados.
public static class Dtos
{
    public static string CodigoOa(ObjetivoAprendizaje o) =>
        Calificacion.CodigoOficial(o.Asignatura.Codigo, o.Nivel.CodigoMineduc, o.Numero);

    public static OaDto Oa(ObjetivoAprendizaje o) => new(
        o.Id, $"OA{o.Numero}", CodigoOa(o), o.Numero, o.Eje, o.Descripcion,
        o.AsignaturaId, o.Asignatura.Nombre, o.Asignatura.Codigo, o.Asignatura.Color,
        o.NivelId, o.Nivel.Nombre, o.Nivel.Orden);

    public static string NombreCurso(Curso c) => $"{c.Nivel.Nombre} {c.Letra}";

    public static string NombreEstudiante(Estudiante e) => $"{e.Nombre} {e.Apellido}";
}
