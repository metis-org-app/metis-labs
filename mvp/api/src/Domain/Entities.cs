namespace MetisCurriculum.Api.Domain;

public class Profesor
{
    public int Id { get; set; }
    public required string Nombre { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public string Rol { get; set; } = "Profesor";
}

public class Asignatura
{
    public int Id { get; set; }
    public required string Codigo { get; set; }   // LEN, MAT, CN, HIS...
    public required string Nombre { get; set; }
}

public class Nivel
{
    public int Id { get; set; }
    public required string Codigo { get; set; }   // 1B..8B, 1M..4M
    public required string Nombre { get; set; }   // "1° Básico"
    public int Orden { get; set; }
}

public class ObjetivoAprendizaje
{
    public int Id { get; set; }
    public int AsignaturaId { get; set; }
    public Asignatura Asignatura { get; set; } = null!;
    public int NivelId { get; set; }
    public Nivel Nivel { get; set; } = null!;
    public int Numero { get; set; }
    public string Codigo => $"OA{Numero}";
    public string? Eje { get; set; }
    public required string Descripcion { get; set; }
}

public class Curso
{
    public int Id { get; set; }
    public int ProfesorId { get; set; }
    public Profesor Profesor { get; set; } = null!;
    public int NivelId { get; set; }
    public Nivel Nivel { get; set; } = null!;
    public required string Letra { get; set; }
    public int Anio { get; set; }
    public List<CursoOA> Objetivos { get; set; } = [];
    public List<Estudiante> Estudiantes { get; set; } = [];
}

public class CursoOA
{
    public int CursoId { get; set; }
    public Curso Curso { get; set; } = null!;
    public int ObjetivoId { get; set; }
    public ObjetivoAprendizaje Objetivo { get; set; } = null!;
    public DateTime AsignadoEn { get; set; } = DateTime.UtcNow;
}

public enum TipoPie { Ninguno, Permanente, Transitorio }

public class Estudiante
{
    public int Id { get; set; }
    public int? CursoId { get; set; }
    public Curso? Curso { get; set; }
    public required string Rut { get; set; }
    public required string Nombre { get; set; }
    public required string Apellido { get; set; }
    public DateOnly? FechaNacimiento { get; set; }
    public string? Diagnostico { get; set; }      // TEA, TDA-H, TL, DI...
    public int? NivelTea { get; set; }            // 1, 2, 3 (DSM-5)
    public TipoPie TipoPie { get; set; }
    public string? Observaciones { get; set; }
}

// Un estudiante excluido de un OA asignado a su curso (adecuación curricular).
public class ExclusionOA
{
    public int CursoId { get; set; }
    public int ObjetivoId { get; set; }
    public int EstudianteId { get; set; }
    public Estudiante Estudiante { get; set; } = null!;
}

public class Planificacion
{
    public int Id { get; set; }
    public int CursoId { get; set; }
    public Curso Curso { get; set; } = null!;
    public DateOnly SemanaInicio { get; set; }
    public required string Titulo { get; set; }
    public string? Actividades { get; set; }
    public string? Adecuaciones { get; set; }
    public List<ObjetivoAprendizaje> Objetivos { get; set; } = [];
}
