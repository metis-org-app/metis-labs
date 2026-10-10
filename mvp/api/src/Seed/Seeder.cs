using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Seed;

/// Carga catálogos (niveles, asignaturas), OA desde CSV y datos de demostración ficticios.
public static class Seeder
{
    public static async Task RunAsync(AppDb db, IConfiguration config, ILogger logger)
    {
        if (!await db.Niveles.AnyAsync())
        {
            var orden = 0;
            foreach (var n in Enumerable.Range(1, 8))
                db.Niveles.Add(new Nivel { Codigo = $"{n}B", CodigoMineduc = $"{n:00}", Nombre = $"{n}° Básico", Orden = ++orden });
            foreach (var n in Enumerable.Range(1, 4))
                db.Niveles.Add(new Nivel { Codigo = $"{n}M", CodigoMineduc = $"{n}M", Nombre = $"{n}° Medio", Orden = ++orden });

            db.Asignaturas.AddRange(
                new Asignatura { Codigo = "LE", Nombre = "Lenguaje y Comunicación", Color = "#c2410c" },
                new Asignatura { Codigo = "MA", Nombre = "Matemática", Color = "#1d4ed8" },
                new Asignatura { Codigo = "CN", Nombre = "Ciencias Naturales", Color = "#15803d" },
                new Asignatura { Codigo = "HI", Nombre = "Historia, Geografía y Ciencias Sociales", Color = "#7e22ce" });
            await db.SaveChangesAsync();
        }

        var csvPath = config["Seed:OasCsv"] ?? "data/oas.csv";
        if (!await db.Objetivos.AnyAsync() && File.Exists(csvPath))
        {
            var r = await CsvImporter.ImportarAsync(db, await File.ReadAllTextAsync(csvPath));
            logger.LogInformation("OA importados desde {Path}: {Creados} creados, {Errores} errores", csvPath, r.Creados, r.Errores.Count);
            foreach (var e in r.Errores) logger.LogWarning("{Error}", e);
        }

        if (await db.Profesores.AnyAsync() || !config.GetValue("Seed:Demo", true)) return;
        await DemoAsync(db, config, logger);
    }

    private static async Task DemoAsync(AppDb db, IConfiguration config, ILogger logger)
    {
        var profe = new Profesor
        {
            Nombre = "Juan Soler",
            Email = (config["Seed:DemoEmail"] ?? "profe@metis.cl").ToLowerInvariant(),
            PasswordHash = Passwords.Hash(config["Seed:DemoPassword"] ?? "metis123"),
        };
        db.Profesores.Add(profe);
        await db.SaveChangesAsync();

        var niveles = await db.Niveles.ToDictionaryAsync(n => n.Codigo);
        var asig = await db.Asignaturas.ToDictionaryAsync(a => a.Codigo);
        var oas = await db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel).ToListAsync();
        ObjetivoAprendizaje Oa(string a, string n, int num) => oas.Single(o => o.Asignatura.Codigo == a && o.Nivel.Codigo == n && o.Numero == num);

        var anio = DateTime.UtcNow.Year;
        Curso NuevoCurso(string nivel, string letra) => new() { ProfesorId = profe.Id, NivelId = niveles[nivel].Id, Letra = letra, Anio = anio };
        var c1A = NuevoCurso("1B", "A");
        var c4B = NuevoCurso("4B", "B");
        var c8A = NuevoCurso("8B", "A");
        db.Cursos.AddRange(c1A, c4B, c8A);
        await db.SaveChangesAsync();

        // OA asignados: todo 1° básico al 1° A y Lenguaje de 8° al 8° A, con algo de avance.
        foreach (var o in oas.Where(o => o.Nivel.Codigo == "1B"))
        {
            var estado = o.Asignatura.Codigo == "CN" && o.Numero <= 2 ? EstadoOa.Cubierto
                : o.Asignatura.Codigo == "CN" && o.Numero <= 6 ? EstadoOa.EnProgreso
                : EstadoOa.Pendiente;
            db.CursoObjetivos.Add(new CursoOA { CursoId = c1A.Id, ObjetivoId = o.Id, Estado = estado });
        }
        foreach (var o in oas.Where(o => o.Nivel.Codigo == "8B"))
            db.CursoObjetivos.Add(new CursoOA { CursoId = c8A.Id, ObjetivoId = o.Id, Estado = o.Numero == 1 ? EstadoOa.EnProgreso : EstadoOa.Pendiente });

        // Estudiantes ficticios: nombres y RUT generados, no corresponden a personas reales.
        var rutBase = 26_100_000;
        Estudiante E(Curso c, string nombre, string apellido, string? dx, int? nivelTea, TipoPie pie, int edad, string? apoyos = null, string? apoderado = null)
        {
            var cuerpo = (rutBase++).ToString();
            var e = new Estudiante
            {
                CursoId = c.Id, Rut = $"{cuerpo}-{Rut.DigitoVerificador(cuerpo)}", Nombre = nombre, Apellido = apellido,
                Diagnostico = dx, NivelTea = nivelTea, TipoPie = pie, Apoyos = apoyos,
                FechaNacimiento = new DateOnly(anio - edad, 3 + rutBase % 9, 1 + rutBase % 27),
                NombreApoderado = apoderado, TelefonoApoderado = apoderado is null ? null : $"+56 9 {5000 + rutBase % 4000} {1000 + rutBase % 8000}",
            };
            db.Estudiantes.Add(e);
            return e;
        }

        var martina = E(c1A, "Martina", "Ejemplo Uno", "TEA", 1, TipoPie.Permanente, 6,
            "Anticipar cambios de rutina con agenda visual. Instrucciones de a una, cortas y literales.", "Carolina Ejemplo");
        var tomas = E(c1A, "Tomás", "Ejemplo Dos", "TEA", 2, TipoPie.Permanente, 7,
            "Apoyo de pictogramas. Tiempo extra en evaluaciones. Espacio de calma disponible.", "Rodrigo Ejemplo");
        var isidora = E(c1A, "Isidora", "Ejemplo Tres", "TDA-H", null, TipoPie.Transitorio, 6,
            "Ubicación cerca del profesor. Pausas activas cada 15 minutos.", "Paula Ejemplo");
        var benjamin = E(c1A, "Benjamín", "Ejemplo Cuatro", "TL", null, TipoPie.Transitorio, 6,
            "Apoyo fonoaudiológico. Reforzar vocabulario con imágenes.", "Andrea Ejemplo");
        var florencia = E(c1A, "Florencia", "Ejemplo Cinco", null, null, TipoPie.Ninguno, 7, apoderado: "Marcela Ejemplo");
        E(c1A, "Agustín", "Ejemplo Seis", null, null, TipoPie.Ninguno, 6, apoderado: "Felipe Ejemplo");
        E(c4B, "Josefa", "Ejemplo Siete", "TEA", 1, TipoPie.Permanente, 9, "Avisar con anticipación las evaluaciones.");
        E(c4B, "Vicente", "Ejemplo Ocho", "TL", null, TipoPie.Transitorio, 10);
        E(c8A, "Maximiliano", "Ejemplo Nueve", "TEA", 1, TipoPie.Permanente, 13, "Prefiere trabajar con audífonos. Instrucciones por escrito.");
        E(c8A, "Antonia", "Ejemplo Diez", "TDA-H", null, TipoPie.Transitorio, 14);
        E(c8A, "Lucas", "Ejemplo Once", null, null, TipoPie.Ninguno, 13);
        await db.SaveChangesAsync();

        // Adecuación: Tomás no trabaja por ahora el OA 3 de Ciencias (estructuras de las plantas).
        db.Exclusiones.Add(new ExclusionOA { CursoId = c1A.Id, ObjetivoId = Oa("CN", "1B", 3).Id, EstudianteId = tomas.Id });

        db.Planificaciones.AddRange(
            new Planificacion
            {
                CursoId = c1A.Id, SemanaInicio = Lunes(DateTime.UtcNow.AddDays(-7)), Titulo = "Seres vivos y su entorno",
                Actividades = "Salida al patio para observar plantas e insectos. Registro con dibujos. Comparación de animales por cubierta corporal.",
                Adecuaciones = "Anticipar la salida con agenda visual. Pictogramas para el registro. Espacio de calma disponible.",
                Objetivos = [Oa("CN", "1B", 1), Oa("CN", "1B", 2)],
            },
            new Planificacion
            {
                CursoId = c1A.Id, SemanaInicio = Lunes(DateTime.UtcNow), Titulo = "Las plantas y sus partes",
                Actividades = "Germinación de porotos en vasos. Dibujo y rotulado de raíz, tallo, hojas y flor.",
                Adecuaciones = "Modelo concreto de planta para manipular. Rótulos con imagen y palabra.",
                Objetivos = [Oa("CN", "1B", 3), Oa("CN", "1B", 4)],
            });

        await MaterialesAsync(db, asig, niveles, c1A, Oa);
        await db.SaveChangesAsync();

        // Evaluación formativa publicada en 1° A, con entregas y conversaciones con Metis.
        var evalCiencias = new Evaluacion
        {
            CursoId = c1A.Id, AsignaturaId = asig["CN"].Id, Titulo = "Seres vivos, animales y plantas", Tipo = TipoEvaluacion.Formativa,
            Estado = EstadoEvaluacion.Publicada, PublicadaEn = DateTime.UtcNow.AddDays(-2), DuracionMinutos = 30, Token = "seres-vivos-1a",
            Instrucciones = "Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.",
            AsistenteActivo = true, NivelAyuda = 3,
            InstruccionesAsistente = "Usa ejemplos de animales y plantas del patio del colegio.",
            Preguntas =
            [
                P(1, TipoPregunta.Unica, "¿Cuál de estos es un ser vivo?", ["Una piedra", "Un perro", "Una mesa", "Una pelota"], [1], Oa("CN", "1B", 1),
                    "Piensa en qué cosas crecen, comen y respiran."),
                P(2, TipoPregunta.Multiple, "¿Qué necesitan los seres vivos para vivir? Marca todas las correctas.", ["Agua", "Alimento", "Aire", "Juguetes"], [0, 1, 2], Oa("CN", "1B", 1),
                    "Recuerda lo que necesita una planta del jardín y también un gato."),
                P(3, TipoPregunta.Unica, "¿Qué animal tiene el cuerpo cubierto de plumas?", ["Gato", "Pez", "Gallina", "Culebra"], [2], Oa("CN", "1B", 2),
                    "Piensa en animales que vuelan o que tienen alas."),
                P(4, TipoPregunta.VerdaderoFalso, "Las raíces de una planta sirven para absorber agua del suelo.", [], [0], Oa("CN", "1B", 3),
                    "Recuerda el experimento de los porotos: ¿por dónde toma agua la planta?"),
                P(5, TipoPregunta.Unica, "¿Con qué sentido sentimos el olor de una flor?", ["Vista", "Olfato", "Oído", "Gusto"], [1], Oa("CN", "1B", 6),
                    "¿Qué parte de tu cara usas para oler?"),
                P(6, TipoPregunta.Abierta, "Nombra un hábito para mantener tu cuerpo sano y explica por qué es importante.", [], [], Oa("CN", "1B", 7),
                    "Piensa en lo que haces antes de comer o en el recreo.", puntaje: 2),
            ],
        };
        // Evaluación en borrador para 8° A.
        var evalLenguaje = new Evaluacion
        {
            CursoId = c8A.Id, AsignaturaId = asig["LE"].Id, Titulo = "Textos de los medios de comunicación", Tipo = TipoEvaluacion.Sumativa,
            Estado = EstadoEvaluacion.Borrador, DuracionMinutos = 45, Token = EvaluacionesEndpoints.NuevoToken(), NivelAyuda = 1,
            Instrucciones = "Lee la noticia entregada por tu profesor antes de responder.",
            Preguntas =
            [
                P(1, TipoPregunta.Unica, "¿Cuál es el propósito principal de una noticia?", ["Entretener con una historia inventada", "Informar sobre un hecho actual", "Convencer de comprar un producto", "Expresar sentimientos"], [1], Oa("LE", "8B", 10)),
                P(2, TipoPregunta.VerdaderoFalso, "Una carta al director expresa la opinión de quien la escribe.", [], [0], Oa("LE", "8B", 10)),
                P(3, TipoPregunta.Abierta, "Explica una diferencia entre una noticia y una columna de opinión.", [], [], Oa("LE", "8B", 10), puntaje: 3),
            ],
        };
        db.Evaluaciones.AddRange(evalCiencias, evalLenguaje);
        await db.SaveChangesAsync();

        // Entregas de ejemplo: las conversaciones se generan con el mismo asistente que usa la rendición.
        var excluidosTomas = new HashSet<int> { Oa("CN", "1B", 3).Id };
        await IntentoAsync(db, evalCiencias, martina, [], [[1], [0, 1, 2], [2], [0], [1]], "Los hábitos sanos son lavarse las manos antes de comer porque así no nos enfermamos.",
            [(1, "hola"), (2, "no entiendo"), (2, "dame otra pista")], revisar: 2);
        await IntentoAsync(db, evalCiencias, tomas, excluidosTomas, [[1], [0, 2], [2], [1]], "comer fruta",
            [(1, "cual es la respuesta"), (3, "no se"), (3, "otra pista")], revisar: null);
        await IntentoAsync(db, evalCiencias, isidora, [], [[1], [0, 1, 3], [0], [0], [1]], "dormir bien para tener energia",
            [(3, "ayuda")], revisar: 1.5m);
        await IntentoAsync(db, evalCiencias, florencia, [], [[1], [0, 1, 2], [2], [0], [0]], "Hacer ejercicio porque el corazón se pone fuerte y crecemos sanos.",
            [], revisar: 2);
        // Benjamín empezó y aún no entrega.
        db.Intentos.Add(new Intento { EvaluacionId = evalCiencias.Id, EstudianteId = benjamin.Id, Clave = EvaluacionesEndpoints.NuevoToken(18), IniciadoEn = DateTime.UtcNow.AddMinutes(-5) });
        await db.SaveChangesAsync();

        logger.LogInformation("Datos de demostración creados. Usuario: {Email}", profe.Email);
    }

    private static Pregunta P(int orden, TipoPregunta tipo, string enunciado, List<string> opciones, List<int> correctas, ObjetivoAprendizaje oa,
        string? pista = null, decimal puntaje = 1) => new()
    {
        Orden = orden, Tipo = tipo, Enunciado = enunciado, Correctas = correctas, ObjetivoId = oa.Id, PistaDocente = pista, Puntaje = puntaje,
        Opciones = tipo == TipoPregunta.VerdaderoFalso ? ["Verdadero", "Falso"] : opciones,
    };

    /// Crea un intento entregado: selecciones para las preguntas cerradas (en orden) y texto para la abierta.
    private static async Task IntentoAsync(AppDb db, Evaluacion e, Estudiante est, HashSet<int> excluidos, List<List<int>> selecciones, string textoAbierta,
        List<(int Orden, string Texto)> consultas, decimal? revisar)
    {
        var preguntas = Rendicion.PreguntasDelIntento(e, excluidos);
        var intento = new Intento
        {
            EvaluacionId = e.Id, EstudianteId = est.Id, Clave = EvaluacionesEndpoints.NuevoToken(18),
            IniciadoEn = DateTime.UtcNow.AddDays(-1).AddMinutes(-25), EntregadoEn = DateTime.UtcNow.AddDays(-1),
        };
        var cerrada = 0;
        foreach (var p in preguntas)
        {
            var r = new RespuestaPregunta { PreguntaId = p.Id };
            if (p.Tipo == TipoPregunta.Abierta) r.Texto = textoAbierta;
            else r.Seleccion = cerrada < selecciones.Count ? selecciones[cerrada++] : [];
            r.Puntaje = p.Tipo == TipoPregunta.Abierta ? revisar : Calificacion.Corregir(p, r);
            if (p.Tipo == TipoPregunta.Abierta && revisar is not null) r.Comentario = "Bien explicado. Agrega un ejemplo la próxima vez.";
            intento.Respuestas.Add(r);
        }
        Calificacion.Recalcular(intento, preguntas, e.Exigencia);
        db.Intentos.Add(intento);
        await db.SaveChangesAsync();

        var hora = intento.IniciadoEn.AddMinutes(2);
        foreach (var (orden, texto) in consultas)
        {
            var p = e.Preguntas.Single(x => x.Orden == orden);
            if (!preguntas.Contains(p)) continue;
            var previas = await db.Mensajes.CountAsync(m => m.IntentoId == intento.Id && m.PreguntaId == p.Id && m.Rol == "metis" && m.NivelAyuda != null);
            var oa = await db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel).SingleAsync(o => o.Id == p.ObjetivoId);
            var resp = AsistenteMetis.Responder(new AsistenteMetis.Contexto(p, oa, Dtos.CodigoOa(oa), e.NivelAyuda, e.AsistenteActivo,
                e.InstruccionesAsistente, previas, est.Diagnostico == "TEA", est.Nombre), texto);
            db.Mensajes.Add(new MensajeAsistente { IntentoId = intento.Id, PreguntaId = p.Id, Rol = "estudiante", Texto = texto, CreadoEn = hora });
            db.Mensajes.Add(new MensajeAsistente { IntentoId = intento.Id, PreguntaId = p.Id, Rol = "metis", Texto = resp.Texto, NivelAyuda = resp.Nivel, CreadoEn = hora.AddSeconds(3) });
            hora = hora.AddMinutes(2);
            await db.SaveChangesAsync();
        }
    }

    private static DateOnly Lunes(DateTime fecha)
    {
        var d = DateOnly.FromDateTime(fecha);
        return d.AddDays(-(((int)d.DayOfWeek + 6) % 7));
    }

    private static Task MaterialesAsync(AppDb db, Dictionary<string, Asignatura> asig, Dictionary<string, Nivel> niveles, Curso c1A,
        Func<string, string, int, ObjetivoAprendizaje> oa)
    {
        Material M(string titulo, TipoMaterial tipo, string a, string n, string descripcion, string contenido, ObjetivoAprendizaje[] objetivos,
            bool lecturaFacil = false, int? cursoId = null, string? url = null) => new()
        {
            Titulo = titulo, Tipo = tipo, AsignaturaId = asig[a].Id, NivelId = niveles[n].Id, Descripcion = descripcion, Contenido = contenido,
            Objetivos = [.. objetivos], LecturaFacil = lecturaFacil, CursoId = cursoId, Url = url,
        };

        db.Materiales.AddRange(
            M("Seres vivos y cosas no vivas", TipoMaterial.Guia, "CN", "1B",
                "Guía de trabajo para distinguir seres vivos de cosas no vivas a partir de sus características.",
                """
                # Seres vivos y cosas no vivas

                Los seres vivos **nacen, crecen, se reproducen y mueren**. También necesitan agua, alimento y aire.

                ## Actividad 1: Observo
                Sal al patio con tu curso y dibuja 3 seres vivos y 3 cosas no vivas que encuentres.

                ## Actividad 2: Clasifico
                Recorta las imágenes y pégalas en la columna que corresponde:
                - Seres vivos: árbol, perro, hormiga, niña.
                - Cosas no vivas: piedra, mesa, pelota, lápiz.

                ## Para pensar
                ¿Una semilla es un ser vivo? Conversa con tu compañero y explica por qué.
                """, [oa("CN", "1B", 1)]),
            M("Los seres vivos crecen (lectura fácil)", TipoMaterial.Lectura, "CN", "1B",
                "Texto en lectura fácil con frases cortas, una idea por línea y apoyo de imágenes.",
                """
                # Los seres vivos crecen

                Un perro es un ser vivo.
                Un perro nace pequeño.
                Un perro come y toma agua.
                Un perro crece.

                Una piedra no es un ser vivo.
                Una piedra no come.
                Una piedra no crece.

                ## Pregunta
                ¿Tú creces? Sí / No
                """, [oa("CN", "1B", 1)], lecturaFacil: true),
            M("Clasifico animales por su cubierta", TipoMaterial.Ficha, "CN", "1B",
                "Ficha para comparar animales según su cubierta corporal: pelos, plumas, escamas o piel desnuda.",
                """
                # ¿Cómo es su cubierta?

                Une cada animal con su cubierta corporal:
                - Gato → pelos
                - Gallina → plumas
                - Pez → escamas
                - Rana → piel desnuda

                ## Desafío
                Busca un animal de Chile y dibuja su cubierta. Por ejemplo: el pudú, el cóndor o el pejerrey.
                """, [oa("CN", "1B", 2), oa("CN", "1B", 5)]),
            M("Partes de la planta", TipoMaterial.Presentacion, "CN", "1B",
                "Presentación para la clase sobre raíz, tallo, hojas y flores, con preguntas para cada lámina.",
                """
                # Partes de la planta

                ## Lámina 1: La raíz
                Está bajo la tierra. Absorbe el agua y sujeta la planta.

                ## Lámina 2: El tallo
                Sostiene la planta y lleva el agua hacia las hojas.

                ## Lámina 3: Las hojas
                Captan la luz del sol. Las hay de muchas formas y tamaños.

                ## Lámina 4: La flor
                Allí se forman los frutos y las semillas.

                ## Cierre
                Dibuja una planta y rotula sus cuatro partes.
                """, [oa("CN", "1B", 3)], cursoId: c1A.Id),
            M("Mis cinco sentidos", TipoMaterial.Ficha, "CN", "1B",
                "Ficha con apoyo visual para asociar cada sentido con su órgano y una situación de cuidado.",
                """
                # Mis cinco sentidos

                - Vista → ojos → No miro directo al sol.
                - Oído → oídos → No escucho música muy fuerte.
                - Olfato → nariz → No huelo productos de limpieza.
                - Gusto → lengua → No pruebo cosas que no conozco.
                - Tacto → piel → No toco cosas muy calientes.

                ## Juego
                Con los ojos tapados, adivina qué objeto tienes en la mano solo usando el tacto.
                """, [oa("CN", "1B", 6)], lecturaFacil: true),
            M("Sílabas y sonidos", TipoMaterial.Guia, "LE", "1B",
                "Guía de conciencia fonológica: separar palabras en sílabas y reconocer el sonido inicial.",
                """
                # Sílabas y sonidos

                ## Aplaudo las sílabas
                Di cada palabra aplaudiendo una vez por sílaba:
                - ca-sa (2)
                - pe-lo-ta (3)
                - ma-ri-po-sa (4)

                ## ¿Con qué sonido empieza?
                Encierra los dibujos que empiezan con el sonido /m/: mano, sol, mesa, luna, mono.
                """, [oa("LE", "1B", 3)]),
            M("Contar de 2 en 2 y de 5 en 5", TipoMaterial.Ficha, "MA", "1B",
                "Ficha con material concreto para contar en grupos de 2, 5 y 10.",
                """
                # Contamos en grupos

                ## De 2 en 2
                Cuenta los calcetines de a pares: 2, 4, 6, 8, …

                ## De 5 en 5
                Cuenta los dedos de las manos de tus compañeros: 5, 10, 15, 20, …

                ## De 10 en 10
                Agrupa palitos de helado en atados de 10 y cuenta: 10, 20, 30, …
                """, [oa("MA", "1B", 1)]),
            M("Cómo analizar una noticia", TipoMaterial.Guia, "LE", "8B",
                "Guía para identificar el hecho, las fuentes y la diferencia entre información y opinión.",
                """
                # Cómo analizar una noticia

                ## Paso 1: El hecho
                ¿Qué pasó? ¿A quién? ¿Cuándo y dónde?

                ## Paso 2: Las fuentes
                ¿Quiénes son citados en la noticia? ¿Son confiables?

                ## Paso 3: Información u opinión
                Subraya en azul los hechos y en rojo las opiniones.

                ## Paso 4: Propósito
                ¿Qué busca el medio con esta publicación? Fundamenta con una cita del texto.
                """, [oa("LE", "8B", 10)]),
            M("Pasos para leer una noticia (lectura fácil)", TipoMaterial.Lectura, "LE", "8B",
                "Versión en lectura fácil con pasos numerados y preguntas cerradas para cada paso.",
                """
                # Pasos para leer una noticia

                1. Lee el título.
                2. Busca qué pasó.
                3. Busca dónde pasó.
                4. Busca cuándo pasó.
                5. Pregúntate: ¿esto es un hecho o una opinión?

                ## Recuerda
                Un hecho se puede comprobar.
                Una opinión es lo que alguien piensa.
                """, [oa("LE", "8B", 10)], lecturaFacil: true),
            M("Bases Curriculares en curriculumnacional.cl", TipoMaterial.Lectura, "CN", "1B",
                "Sitio oficial del MINEDUC con los programas de estudio, OA e indicadores de evaluación.",
                "Consulta los programas de estudio y los indicadores de evaluación de cada OA en el sitio oficial del Ministerio de Educación.",
                [], url: "https://www.curriculumnacional.cl"));
        return Task.CompletedTask;
    }
}
