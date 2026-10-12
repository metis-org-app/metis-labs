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
    public required string Codigo { get; set; }   // Código único en Metis: LE, LL, MA, CN, HI, IN…
    public required string Nombre { get; set; }
    public string? Prefijo { get; set; }           // Prefijo del código oficial si difiere del código (Lengua y Literatura usa LE)
    public string? Area { get; set; }              // Formación general, electivo o diferenciado (3° y 4° medio)
    public string Color { get; set; } = "#24507f";

    public string PrefijoOficial => Prefijo ?? Codigo;
}

public class Nivel
{
    public int Id { get; set; }
    public required string Codigo { get; set; }        // 1B..8B, 1M..4M
    public required string CodigoMineduc { get; set; } // 01..08, 1M..4M (como en "CN01 OA 03")
    public required string Nombre { get; set; }        // "1° Básico"
    public int Orden { get; set; }
    public string Ciclo => Orden <= 4 ? "Primer ciclo básico" : Orden <= 8 ? "Segundo ciclo básico" : "Enseñanza media";
}

public class ObjetivoAprendizaje
{
    public int Id { get; set; }
    public int AsignaturaId { get; set; }
    public Asignatura Asignatura { get; set; } = null!;
    public int NivelId { get; set; }
    public Nivel Nivel { get; set; } = null!;
    public int Numero { get; set; }
    public string? Eje { get; set; }
    public required string Descripcion { get; set; }
    public string? Fuente { get; set; }            // Documento oficial de origen, ej. "Bases Curriculares 1° a 6° básico (2012)"
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

public enum EstadoOa { Pendiente, EnProgreso, Cubierto }

public class CursoOA
{
    public int CursoId { get; set; }
    public Curso Curso { get; set; } = null!;
    public int ObjetivoId { get; set; }
    public ObjetivoAprendizaje Objetivo { get; set; } = null!;
    public EstadoOa Estado { get; set; } = EstadoOa.Pendiente;
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
    public string? Diagnostico { get; set; }      // TEA, TDA-H, TL, DI, FIL...
    public int? NivelTea { get; set; }            // 1, 2, 3 (DSM-5)
    public TipoPie TipoPie { get; set; }
    public string? Apoyos { get; set; }           // apoyos y adecuaciones que necesita
    public string? NombreApoderado { get; set; }
    public string? TelefonoApoderado { get; set; }
    public string? EmailApoderado { get; set; }
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

public enum TipoMaterial { Guia, Presentacion, Lectura, Video, Ficha, Documento }

public class Material
{
    public int Id { get; set; }
    public required string Titulo { get; set; }
    public TipoMaterial Tipo { get; set; }
    public int AsignaturaId { get; set; }
    public Asignatura Asignatura { get; set; } = null!;
    public int NivelId { get; set; }
    public Nivel Nivel { get; set; } = null!;
    public int? CursoId { get; set; }               // null = biblioteca compartida
    public Curso? Curso { get; set; }
    public string? Descripcion { get; set; }
    public string? Contenido { get; set; }          // texto del material (vista de lectura)
    public string? Url { get; set; }
    public bool LecturaFacil { get; set; }          // adaptado: lectura fácil / apoyos visuales
    // Archivo subido por el profesor (PDF, Word, PowerPoint o texto): fuente para generar evaluaciones con IA.
    public string? ArchivoNombre { get; set; }
    public string? ArchivoTipo { get; set; }
    public long? ArchivoTamano { get; set; }
    public MaterialArchivo? Archivo { get; set; }   // bytes en tabla aparte para no cargarlos en los listados
    public DateTime CreadoEn { get; set; } = DateTime.UtcNow;
    public List<ObjetivoAprendizaje> Objetivos { get; set; } = [];
}

public class MaterialArchivo
{
    public int MaterialId { get; set; }
    public required byte[] Datos { get; set; }
}

public enum TipoEvaluacion { Formativa, Sumativa }
public enum EstadoEvaluacion { Borrador, Publicada, Cerrada }
public enum TipoPregunta { Unica, Multiple, VerdaderoFalso, Abierta }

public class Evaluacion
{
    public int Id { get; set; }
    public int CursoId { get; set; }
    public Curso Curso { get; set; } = null!;
    public int AsignaturaId { get; set; }
    public Asignatura Asignatura { get; set; } = null!;
    public required string Titulo { get; set; }
    public string? Instrucciones { get; set; }
    public TipoEvaluacion Tipo { get; set; } = TipoEvaluacion.Formativa;
    public EstadoEvaluacion Estado { get; set; } = EstadoEvaluacion.Borrador;
    public int DuracionMinutos { get; set; } = 30;
    public int Exigencia { get; set; } = 60;        // % para la nota 4,0
    public required string Token { get; set; }       // link para estudiantes
    // Asistente Metis embebido en la evaluación
    public bool AsistenteActivo { get; set; } = true;
    public int NivelAyuda { get; set; } = 2;         // 1 preguntas guía · 2 pistas · 3 ejemplos parciales
    public string? InstruccionesAsistente { get; set; }
    public string? Dificultad { get; set; }          // Básico · Intermedio · Avanzado
    public bool GeneradaConIa { get; set; }
    public DateTime CreadaEn { get; set; } = DateTime.UtcNow;
    public DateTime? PublicadaEn { get; set; }
    public List<Pregunta> Preguntas { get; set; } = [];
}

public class Pregunta
{
    public int Id { get; set; }
    public int EvaluacionId { get; set; }
    public Evaluacion Evaluacion { get; set; } = null!;
    public int Orden { get; set; }
    public TipoPregunta Tipo { get; set; }
    public required string Enunciado { get; set; }
    public List<string> Opciones { get; set; } = [];
    public List<int> Correctas { get; set; } = [];
    public decimal Puntaje { get; set; } = 1;
    public int? ObjetivoId { get; set; }
    public ObjetivoAprendizaje? Objetivo { get; set; }
    public bool AsistenteHabilitado { get; set; } = true;
    public string? Justificacion { get; set; }       // por qué la respuesta es correcta (solo profesor)
    public string? Fuente { get; set; }              // cita del material o del OA de origen
    public string? PistaDocente { get; set; }        // la usa Metis en los niveles 2 y 3
}

public class Intento
{
    public int Id { get; set; }
    public int EvaluacionId { get; set; }
    public Evaluacion Evaluacion { get; set; } = null!;
    public int? EstudianteId { get; set; }           // null en la vista previa del profesor
    public Estudiante? Estudiante { get; set; }
    public bool EsPrueba { get; set; }
    public required string Clave { get; set; }
    public DateTime IniciadoEn { get; set; } = DateTime.UtcNow;
    public DateTime? EntregadoEn { get; set; }
    public List<RespuestaPregunta> Respuestas { get; set; } = [];
    public decimal? PuntajeObtenido { get; set; }
    public decimal PuntajeMaximo { get; set; }
    public decimal? Nota { get; set; }
    public bool RevisionPendiente { get; set; }
    public List<MensajeAsistente> Mensajes { get; set; } = [];
}

public class RespuestaPregunta
{
    public int PreguntaId { get; set; }
    public List<int> Seleccion { get; set; } = [];
    public string? Texto { get; set; }
    public decimal? Puntaje { get; set; }            // null = pendiente de revisión
    public string? Comentario { get; set; }
}

public class MensajeAsistente
{
    public int Id { get; set; }
    public int IntentoId { get; set; }
    public int? PreguntaId { get; set; }
    public required string Rol { get; set; }         // estudiante | metis
    public required string Texto { get; set; }
    public int? NivelAyuda { get; set; }
    public bool PorIa { get; set; }                  // respondido por el modelo de lenguaje (si no, por las reglas)
    public DateTime CreadoEn { get; set; } = DateTime.UtcNow;
}
