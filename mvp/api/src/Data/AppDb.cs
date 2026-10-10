using System.Text.Json;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace MetisCurriculum.Api.Data;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Profesor> Profesores => Set<Profesor>();
    public DbSet<Asignatura> Asignaturas => Set<Asignatura>();
    public DbSet<Nivel> Niveles => Set<Nivel>();
    public DbSet<ObjetivoAprendizaje> Objetivos => Set<ObjetivoAprendizaje>();
    public DbSet<Curso> Cursos => Set<Curso>();
    public DbSet<CursoOA> CursoObjetivos => Set<CursoOA>();
    public DbSet<Estudiante> Estudiantes => Set<Estudiante>();
    public DbSet<ExclusionOA> Exclusiones => Set<ExclusionOA>();
    public DbSet<Planificacion> Planificaciones => Set<Planificacion>();
    public DbSet<Material> Materiales => Set<Material>();
    public DbSet<MaterialArchivo> MaterialArchivos => Set<MaterialArchivo>();
    public DbSet<Evaluacion> Evaluaciones => Set<Evaluacion>();
    public DbSet<Pregunta> Preguntas => Set<Pregunta>();
    public DbSet<Intento> Intentos => Set<Intento>();
    public DbSet<MensajeAsistente> Mensajes => Set<MensajeAsistente>();

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Profesor>().HasIndex(p => p.Email).IsUnique();
        b.Entity<Asignatura>().HasIndex(a => a.Codigo).IsUnique();
        b.Entity<Nivel>(e =>
        {
            e.HasIndex(n => n.Codigo).IsUnique();
            e.Ignore(n => n.Ciclo);
        });
        b.Entity<ObjetivoAprendizaje>().HasIndex(o => new { o.AsignaturaId, o.NivelId, o.Numero }).IsUnique();
        b.Entity<Curso>().HasIndex(c => new { c.ProfesorId, c.NivelId, c.Letra, c.Anio }).IsUnique();

        b.Entity<CursoOA>(e =>
        {
            e.HasKey(x => new { x.CursoId, x.ObjetivoId });
            e.Property(x => x.Estado).HasConversion<string>();
            e.HasOne(x => x.Curso).WithMany(c => c.Objetivos).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Estudiante>(e =>
        {
            e.HasIndex(x => x.Rut).IsUnique();
            e.Property(x => x.TipoPie).HasConversion<string>();
            e.HasOne(x => x.Curso).WithMany(c => c.Estudiantes).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ExclusionOA>(e =>
        {
            e.HasKey(x => new { x.CursoId, x.ObjetivoId, x.EstudianteId });
            e.HasOne<CursoOA>().WithMany().HasForeignKey(x => new { x.CursoId, x.ObjetivoId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Estudiante).WithMany().OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Planificacion>().HasMany(p => p.Objetivos).WithMany().UsingEntity(j => j.ToTable("PlanificacionObjetivos"));

        b.Entity<Material>(e =>
        {
            e.Property(x => x.Tipo).HasConversion<string>();
            e.HasOne(x => x.Curso).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Objetivos).WithMany().UsingEntity(j => j.ToTable("MaterialObjetivos"));
            e.HasOne(x => x.Archivo).WithOne().HasForeignKey<MaterialArchivo>(a => a.MaterialId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<MaterialArchivo>().HasKey(a => a.MaterialId);

        b.Entity<Evaluacion>(e =>
        {
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Tipo).HasConversion<string>();
            e.Property(x => x.Estado).HasConversion<string>();
            e.HasOne(x => x.Curso).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Preguntas).WithOne(p => p.Evaluacion).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Pregunta>(e =>
        {
            e.Property(x => x.Tipo).HasConversion<string>();
            e.Property(x => x.Opciones).HasColumnType("jsonb").HasConversion(JsonConverter<List<string>>(), ListComparer<string>());
            e.Property(x => x.Correctas).HasColumnType("jsonb").HasConversion(JsonConverter<List<int>>(), ListComparer<int>());
            e.HasOne(x => x.Objetivo).WithMany().OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Intento>(e =>
        {
            e.HasIndex(x => x.Clave).IsUnique();
            e.HasOne(x => x.Evaluacion).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Estudiante).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.Property(x => x.Respuestas).HasColumnType("jsonb").HasConversion(
                JsonConverter<List<RespuestaPregunta>>(),
                new ValueComparer<List<RespuestaPregunta>>(
                    (a, c) => JsonSerializer.Serialize(a, Json) == JsonSerializer.Serialize(c, Json),
                    v => JsonSerializer.Serialize(v, Json).GetHashCode(),
                    v => JsonSerializer.Deserialize<List<RespuestaPregunta>>(JsonSerializer.Serialize(v, Json), Json)!));
            e.HasMany(x => x.Mensajes).WithOne().HasForeignKey(m => m.IntentoId).OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<T, string> JsonConverter<T>() where T : new() =>
        new(v => JsonSerializer.Serialize(v, Json), v => JsonSerializer.Deserialize<T>(v, Json) ?? new T());

    private static ValueComparer<List<T>> ListComparer<T>() =>
        new((a, c) => (a ?? new()).SequenceEqual(c ?? new()), v => v.Aggregate(0, (h, x) => HashCode.Combine(h, x)), v => v.ToList());
}
