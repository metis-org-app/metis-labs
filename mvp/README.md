# Metis · MVP

Plataforma para profesores en Chile. Organiza el currículum de cada curso en **Objetivos de Aprendizaje (OA)**, acompaña a los estudiantes con necesidades educativas (PIE, TEA y otras) y permite crear con IA y aplicar **evaluaciones con el asistente Metis integrado** (el núcleo de Evalia). Metis guía al estudiante mientras responde sin darle la respuesta, y el profesor ve cada conversación.

## Levantarlo en local

Requisitos: Docker Desktop (o Docker Engine con Compose).

```bash
git clone <este repo> && cd <carpeta>
git checkout metis-app-mvp
docker compose up --build
```

| Servicio | URL |
|---|---|
| App | http://localhost:3000 |
| API | http://localhost:8080/api/health |
| PostgreSQL | localhost:5432 (metis / metis) |

**Usuario demo:** `profe@metis.cl` / `metis123`. Para cambiarlo, copia `.env.example` a `.env` antes del primer arranque.

### Activar la IA (Evalia + Metis con Claude)

Copia `.env.example` a `.env` y completa `ANTHROPIC_API_KEY` (se crea en [console.anthropic.com](https://console.anthropic.com)). Luego `docker compose up --build`. En la app, *Nueva evaluación → Generar con IA* deja de mostrar el aviso de "IA no configurada".

Sin key la app funciona igual:
- *Generar con IA* arma un esquema de ejemplo desde los OA para que lo edites.
- Metis responde con reglas pedagógicas.
- Las dudas frecuentes se agrupan por pregunta.

El modelo por defecto es `claude-opus-5-5` (se cambia con `IA_MODELO`). Si un filtro de seguridad declina una solicitud, la API la reintenta con otro modelo.

Para volver a los datos de ejemplo (borra todo): `docker compose down -v && docker compose up --build`.

## Recorrido sugerido para la demo

1. **Inicio:** muestra las tareas del profesor: respuestas por revisar, evaluaciones abiertas y borradores.
2. **Mis cursos → 1° Básico A:** todo lo del curso está en pestañas:
   - **Resumen:** panorama PIE, cobertura curricular por asignatura, logro promedio y evaluaciones.
   - **Estudiantes:** nómina con PIE, diagnóstico, apoyos y apoderado.
   - **Currículum:** los OA del curso con su código oficial, estado (pendiente, en progreso o cubierto), uso en planificación y evaluaciones, logro, y **adecuaciones** (estudiantes que no trabajan un OA).
   - **Planificación** semanal.
   - **Materiales** de ejemplo: guías, fichas, lecturas fáciles y presentaciones vinculadas a OA.
   - **Evaluaciones:** el módulo con Metis.
3. **Evaluaciones → "Seres vivos, animales y plantas"**, en la vista *Resultados*:
   - Notas con escala 1,0–7,0 y exigencia del 60%.
   - Logro por OA (L, ML, PL).
   - Análisis por pregunta con las ayudas que entregó Metis.
   - En *Ver respuestas* o *Revisar*: corrección de respuestas abiertas y la conversación completa del estudiante con Metis.
4. **Nueva evaluación (Evalia):** eliges cómo empezar.
   - **Generar con IA:** una consigna breve más los OA del curso.
   - **Pegar contenido:** apuntes o un temario.
   - **Importar archivo:** PDF, Word o PowerPoint, que queda guardado en Materiales.
   - **Desde cero:** el editor manual.

   Con IA el flujo es *Idea → Procesando → Esquema → Crear*:
   - En el esquema editas cada pregunta: tipo, alternativas, respuesta correcta y OA.
   - También editas la pista para Metis, la **pauta o justificación** y la **fuente** (la parte del material o el OA de donde sale la pregunta).
   - Después configuras a Metis (nivel máximo de ayuda, ayuda por pregunta, indicaciones) y usas *Vista previa*.
5. **Publicar y compartir:** link, **código QR** para proyectar en la sala, WhatsApp o correo.
6. **Como estudiante:** abre el link (o http://localhost:3000/rendir/seres-vivos-1a) y entra con un RUT de la nómina. En la ficha de cada estudiante de demo aparece su RUT.
   - Metis lo saluda (con efecto de escritura) y lo acompaña en un chat lateral con avatar. Se le puede **dictar con la voz** y ofrece ayuda si el estudiante lleva un rato sin avanzar.
   - Hay temporizador, barra de progreso y navegación por pregunta.
7. **Resultados → Dudas frecuentes y Conversaciones:**
   - La IA agrupa lo que preguntaron los estudiantes y sugiere qué reforzar.
   - Cada conversación se puede filtrar por pregunta o estudiante.
   - Los mensajes generados con IA llevan la marca "IA".

## Lógica educativa

- **Códigos de OA oficiales** con el formato MINEDUC: asignatura + nivel + número (por ejemplo `CN01 OA 03` es Ciencias Naturales, 1° básico, OA 3, y `LE07 OA 10` es Lengua y Literatura, 7° básico). Siempre se muestra el nivel y la asignatura del OA. La búsqueda acepta el código completo.
- **Curso = nivel + letra + año.** Al crear un curso eliges sus asignaturas (por defecto, las del plan común del nivel) y se le asignan todos sus OA. Después puedes quitar OA o sumar OA de otros niveles para nivelación o trabajo multinivel.
- **Adecuaciones por OA:**
  - Si un estudiante está excluido de un OA, sus evaluaciones omiten esas preguntas.
  - Su nota se calcula sobre el resto.
- **Evaluaciones:**
  - Formativas (logro por OA) o sumativas (nota).
  - Escala chilena 1,0–7,0 con exigencia configurable.
  - Selección múltiple con puntaje proporcional (aciertos menos errores, nunca negativo).
  - Las respuestas abiertas las corrige el profesor, con puntaje parcial y comentario.
  - Cada estudiante entra una sola vez con su RUT. Se guarda automáticamente y se entrega sola si se acaba el tiempo.
  - Al publicar, los OA evaluados pasan a "En progreso".
  - Si ya hay entregas, las preguntas no se pueden modificar: hay que duplicar la evaluación.
- **Logro por OA:** L (≥80%), ML (60–79%) y PL (<60%), por evaluación, por curso y por estudiante.
- **Asistente Metis** (`api/src/Domain/Ia/AsistenteIa.cs`, con respaldo por reglas en `api/src/Domain/AsistenteMetis.cs`):
  - La ayuda es gradual: cada vez que el estudiante pide ayuda en la misma pregunta sube un nivel, hasta el máximo que definió el profesor.
    - Nivel 1: preguntas guía.
    - Nivel 2: la pista del profesor o el OA que se evalúa.
    - Nivel 3: un ejemplo parcial, o descarta una alternativa incorrecta.
  - Con IA, Claude recibe la pregunta, el OA, la pista y las indicaciones del profesor, y el historial de esa pregunta. La respuesta correcta va marcada como secreta.
  - **Si Claude no está disponible o su respuesta parece revelar la solución, responde la versión con reglas.** La vista del estudiante nunca recibe las respuestas correctas.
  - Con estudiantes TEA responde en pasos numerados y lenguaje literal.
  - Cada mensaje queda guardado con el nivel de ayuda y si lo respondió la IA.
- **Evalia: generación de evaluaciones** (`api/src/Domain/Ia/GeneradorEvaluaciones.cs`):
  - Usa los OA del curso que elijas, la consigna y los materiales. Los PDF se envían completos a Claude; Word, PowerPoint y texto se convierten a texto.
  - Devuelve un esquema validado: cada pregunta trae OA, pista, justificación y fuente.
  - Si el curso tiene estudiantes con TEA, aplica pautas de lenguaje claro.
  - Las preguntas mal formadas se descartan antes de mostrarlas.
- **Accesibilidad para el estudiante:**
  - Botón para escuchar la pregunta (síntesis de voz del navegador).
  - Alternativas grandes y una pregunta a la vez.
  - Materiales en lectura fácil.

## Currículum oficial

`data/oas.csv` trae las **Bases Curriculares oficiales completas de 1° básico a IV medio**: 1.793 OA de 51 asignaturas. Se cargan cuando la base está vacía. Cada OA indica el documento del que viene:

| Documento MINEDUC | Niveles | Asignaturas |
|---|---|---|
| Bases Curriculares 1° a 6° básico (2012) | 1°–6° básico | Lenguaje y Comunicación, Matemática, Ciencias Naturales, Historia, Inglés (5° y 6°), Artes Visuales, Música, Educación Física y Salud, Tecnología, Orientación |
| Bases Curriculares 7° básico a 2° medio (2015) | 7° básico–II medio | Lengua y Literatura, Matemática, Ciencias Naturales, Historia, Inglés, Artes Visuales, Música, Educación Física y Salud, Tecnología, Orientación |
| Bases Curriculares 3° y 4° medio (2019) | III y IV medio | Plan común (Lengua y Literatura, Matemática, Inglés, Filosofía, Educación Ciudadana, Ciencias para la Ciudadanía), plan común electivo y las 27 asignaturas de profundización de la Formación Diferenciada Humanístico-Científica |

Cómo se adaptó al modelo de Metis:

- **Se extrajo de los PDF oficiales** con `tools/curriculo` (ver su README). Se revisó que la numeración de cada asignatura y nivel sea continua y que los totales coincidan con los documentos, por ejemplo 26 OA de Lenguaje en 1° básico y 20 de Matemática. Los OA con viñetas conservan sus saltos de línea.
- **Asignaturas.** Cada una tiene un código único en Metis, un prefijo oficial y un área: *Formación general*, *Formación general electiva* o *Formación diferenciada HC*. Lengua y Literatura usa el código `LL` en Metis, pero su código oficial es `LE` (por ejemplo `LE08 OA 10`).
- **3° y 4° medio:**
  - Las asignaturas que el MINEDUC define para "3° o 4° medio" se cargan en ambos niveles.
  - Ciencias para la Ciudadanía se divide en sus cuatro módulos, cada uno con su numeración.
  - Artes, Música y Educación Física del plan electivo son asignaturas propias (`ARE`, `MUE`, `EFE`) con el mismo prefijo oficial.
  - **Los prefijos de las asignaturas nuevas de 3° y 4° medio** (`EC`, `FI`, `CCB`, `FIS`, `LDI`, etc.) **son de Metis.** Contrástalos con [curriculumnacional.cl](https://www.curriculumnacional.cl) antes de usarlos en documentos oficiales.
- **No se incluyen** los OA de habilidades y actitudes (se numeran con letras), la Formación Diferenciada Técnico-Profesional ni la Artística, Religión, ni los programas de Lengua Indígena.
- **Para actualizar o sumar OA:** usa *Currículum → Importar CSV* o edita `data/oas.csv`. Columnas: `asignatura,nivel,numero,eje,descripcion` y, de forma opcional, `asignatura_nombre,prefijo,area,fuente`. Si una asignatura no existe y viene `asignatura_nombre`, se crea. Si el OA ya existe, se actualiza.

Datos de la demo: **estudiantes, apoderados, conversaciones y entregas son ficticios.** No cargues datos reales de menores en este entorno.

## Estructura

```
api/   .NET 10 Minimal API + EF Core + PostgreSQL (Npgsql). Endpoints en api/src/Endpoints, lógica en api/src/Domain.
web/   Next.js 15 + React 19 (TypeScript). /api/* se reenvía al API (variable API_URL).
data/  oas.csv: Bases Curriculares oficiales, semilla del currículum.
tools/curriculo/  extractor de OA desde los PDF oficiales del MINEDUC.
web/public/metis.png  ilustración de Metis, del prototipo Evalia (Pengyi Labs).
```

El stack es el que propone la arquitectura de Metis (`metis-docs`): .NET 10, Next.js y PostgreSQL.

### Desarrollo sin Docker

```bash
docker compose up -d db
cd api/src && Seed__OasCsv=../../data/oas.csv dotnet run --urls http://localhost:8080   # requiere .NET 10 SDK
cd web && npm install && API_URL=http://localhost:8080 npm run dev                        # Node 22
```

## Limitaciones conocidas (es un MVP)

- El esquema se crea con `EnsureCreated`, sin migraciones. Si cambia el modelo, hay que recrear la base (`docker compose down -v`).
- El login es solo para la demo: no hay registro, recuperación de contraseña ni roles más allá de profesor.
- Para rendir, el estudiante se identifica con su RUT (modo nómina). Es suficiente para una demo, pero no es una autenticación fuerte.
- El currículum (OA) es compartido entre profesores y cualquiera puede editarlo.
- Los archivos subidos se guardan en PostgreSQL (hasta 15 MB cada uno). Para producción conviene un almacenamiento de objetos.
- Al generar con IA, los materiales elegidos se envían a la API de Anthropic. No subas documentos con datos personales de estudiantes.
