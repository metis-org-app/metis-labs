using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Seed;

/// Carga catálogos (niveles, asignaturas), OAs desde CSV y datos de demostración ficticios.
public static class Seeder
{
    public static async Task RunAsync(AppDb db, IConfiguration config, ILogger logger)
    {
        if (!await db.Niveles.AnyAsync())
        {
            string[] basica = ["1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B"];
            string[] media = ["1M", "2M", "3M", "4M"];
            var orden = 0;
            db.Niveles.AddRange(basica.Select(c => new Nivel { Codigo = c, Nombre = $"{c[0]}° Básico", Orden = ++orden }));
            db.Niveles.AddRange(media.Select(c => new Nivel { Codigo = c, Nombre = $"{c[0]}° Medio", Orden = ++orden }));

            db.Asignaturas.AddRange(
                new Asignatura { Codigo = "LEN", Nombre = "Lenguaje y Comunicación" },
                new Asignatura { Codigo = "MAT", Nombre = "Matemática" },
                new Asignatura { Codigo = "CN", Nombre = "Ciencias Naturales" },
                new Asignatura { Codigo = "HIS", Nombre = "Historia, Geografía y Ciencias Sociales" });
            await db.SaveChangesAsync();
        }

        var csvPath = config["Seed:OasCsv"] ?? "data/oas.csv";
        if (!await db.Objetivos.AnyAsync() && File.Exists(csvPath))
        {
            var r = await CsvImporter.ImportarAsync(db, await File.ReadAllTextAsync(csvPath));
            logger.LogInformation("OAs importados desde {Path}: {Creados} creados, {Errores} errores", csvPath, r.Creados, r.Errores.Count);
            foreach (var e in r.Errores) logger.LogWarning("{Error}", e);
        }

        if (await db.Profesores.AnyAsync() || !config.GetValue("Seed:Demo", true)) return;

        var profe = new Profesor
        {
            Nombre = "Juan Soler",
            Email = (config["Seed:DemoEmail"] ?? "profe@metis.cl").ToLowerInvariant(),
            PasswordHash = Passwords.Hash(config["Seed:DemoPassword"] ?? "metis123"),
        };
        db.Profesores.Add(profe);
        await db.SaveChangesAsync();

        var niveles = await db.Niveles.ToDictionaryAsync(n => n.Codigo);
        var anio = DateTime.UtcNow.Year;
        Curso NuevoCurso(string nivel, string letra) => new() { ProfesorId = profe.Id, NivelId = niveles[nivel].Id, Letra = letra, Anio = anio };

        var c1A = NuevoCurso("1B", "A");
        var c4B = NuevoCurso("4B", "B");
        var c8A = NuevoCurso("8B", "A");
        db.Cursos.AddRange(c1A, c4B, c8A);
        await db.SaveChangesAsync();

        // Todos los OAs de 1° y 8° básico disponibles en el CSV quedan asignados a esos cursos.
        foreach (var (curso, nivel) in new[] { (c1A, "1B"), (c8A, "8B") })
        {
            var ids = await db.Objetivos.Where(o => o.NivelId == niveles[nivel].Id).Select(o => o.Id).ToListAsync();
            db.CursoObjetivos.AddRange(ids.Select(id => new CursoOA { CursoId = curso.Id, ObjetivoId = id }));
        }

        // Estudiantes ficticios (nombres y RUT generados, no corresponden a personas reales).
        var rutBase = 26_100_000;
        Estudiante E(Curso c, string nombre, string apellido, string? dx, int? nivelTea, TipoPie pie, int edad)
        {
            var cuerpo = (rutBase++).ToString();
            return new Estudiante
            {
                CursoId = c.Id, Rut = $"{cuerpo}-{Rut.DigitoVerificador(cuerpo)}", Nombre = nombre, Apellido = apellido,
                Diagnostico = dx, NivelTea = nivelTea, TipoPie = pie,
                FechaNacimiento = new DateOnly(anio - edad, 3 + rutBase % 9, 1 + rutBase % 27),
            };
        }

        db.Estudiantes.AddRange(
            E(c1A, "Martina", "Ejemplo Uno", "TEA", 1, TipoPie.Permanente, 6),
            E(c1A, "Tomás", "Ejemplo Dos", "TEA", 2, TipoPie.Permanente, 7),
            E(c1A, "Isidora", "Ejemplo Tres", "TDA-H", null, TipoPie.Transitorio, 6),
            E(c1A, "Benjamín", "Ejemplo Cuatro", "TL", null, TipoPie.Transitorio, 6),
            E(c1A, "Florencia", "Ejemplo Cinco", null, null, TipoPie.Ninguno, 7),
            E(c1A, "Agustín", "Ejemplo Seis", null, null, TipoPie.Ninguno, 6),
            E(c4B, "Josefa", "Ejemplo Siete", "TEA", 1, TipoPie.Permanente, 9),
            E(c4B, "Vicente", "Ejemplo Ocho", "TL", null, TipoPie.Transitorio, 10),
            E(c8A, "Maximiliano", "Ejemplo Nueve", "TEA", 1, TipoPie.Permanente, 13),
            E(c8A, "Antonia", "Ejemplo Diez", "TDA-H", null, TipoPie.Transitorio, 14),
            E(c8A, "Lucas", "Ejemplo Once", null, null, TipoPie.Ninguno, 13));
        await db.SaveChangesAsync();

        // Una planificación de ejemplo para 1° básico A.
        var cn = await db.Asignaturas.SingleAsync(a => a.Codigo == "CN");
        var oasCiencias = await db.Objetivos
            .Where(o => o.NivelId == niveles["1B"].Id && o.AsignaturaId == cn.Id && (o.Numero == 1 || o.Numero == 2))
            .ToListAsync();
        var hoy = DateOnly.FromDateTime(DateTime.UtcNow);
        db.Planificaciones.Add(new Planificacion
        {
            CursoId = c1A.Id,
            SemanaInicio = hoy.AddDays(-(((int)hoy.DayOfWeek + 6) % 7)),
            Titulo = "Seres vivos y su entorno",
            Actividades = "Salida al patio para observar plantas e insectos; registro con dibujos; comparación de animales por cubierta corporal.",
            Adecuaciones = "Anticipar la salida con agenda visual; pictogramas para el registro; espacio de calma disponible.",
            Objetivos = oasCiencias,
        });
        await db.SaveChangesAsync();

        logger.LogInformation("Datos de demostración creados. Usuario: {Email}", profe.Email);
    }
}
