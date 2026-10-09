using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

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

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Profesor>().HasIndex(p => p.Email).IsUnique();
        b.Entity<Asignatura>().HasIndex(a => a.Codigo).IsUnique();
        b.Entity<Nivel>().HasIndex(n => n.Codigo).IsUnique();

        b.Entity<ObjetivoAprendizaje>(e =>
        {
            e.Ignore(o => o.Codigo);
            e.HasIndex(o => new { o.AsignaturaId, o.NivelId, o.Numero }).IsUnique();
        });

        b.Entity<Curso>().HasIndex(c => new { c.ProfesorId, c.NivelId, c.Letra, c.Anio }).IsUnique();

        b.Entity<CursoOA>(e =>
        {
            e.HasKey(x => new { x.CursoId, x.ObjetivoId });
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
            e.HasOne<CursoOA>().WithMany()
                .HasForeignKey(x => new { x.CursoId, x.ObjetivoId })
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Estudiante).WithMany().OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Planificacion>()
            .HasMany(p => p.Objetivos)
            .WithMany()
            .UsingEntity(j => j.ToTable("PlanificacionObjetivos"));
    }
}
