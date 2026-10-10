# Metis · MVP

Plataforma para profesores en Chile. Organiza el currículum de cada curso en **Objetivos de Aprendizaje (OA)**, acompaña a los estudiantes con necesidades educativas (PIE, TEA y otras) y permite aplicar **evaluaciones con el asistente Metis integrado**. Metis guía al estudiante mientras responde sin darle la respuesta, y el profesor ve cada conversación.

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
4. **Nueva evaluación:**
   - Creas las preguntas (selección única, múltiple, verdadero o falso, abierta), cada una vinculada a un OA del curso.
   - Configuras a Metis: nivel máximo de ayuda, si puede ayudar en cada pregunta y una pista por pregunta.
   - *Vista previa* abre la evaluación como la verá un estudiante.
   - *Publicar* entrega el link para el curso.
5. **Como estudiante:** abre el link (o http://localhost:3000/rendir/seres-vivos-1a), entra con un RUT de la nómina, responde y conversa con Metis. En la ficha de cada estudiante de demo aparece su RUT.

## Lógica educativa

- **Códigos de OA oficiales** con el formato MINEDUC: asignatura + nivel + número (por ejemplo `CN01 OA 03` es Ciencias Naturales, 1° básico, OA 3). Siempre se muestra el nivel y la asignatura del OA. La búsqueda acepta el código completo.
- **Curso = nivel + letra + año.** Al crear un curso puedes asignarle todos los OA del nivel. También puedes sumar OA de otros niveles para nivelación o trabajo multinivel.
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
- **Asistente Metis** (`api/src/Domain/AsistenteMetis.cs`):
  - La ayuda es gradual: cada vez que el estudiante pide ayuda en la misma pregunta sube un nivel, hasta el máximo que definió el profesor.
    - Nivel 1: preguntas guía.
    - Nivel 2: la pista del profesor o el OA que se evalúa.
    - Nivel 3: descarta una alternativa incorrecta o propone cómo empezar.
  - Nunca revela la respuesta, y la vista del estudiante no recibe las respuestas correctas.
  - Con estudiantes TEA responde en pasos numerados y lenguaje literal.
  - Cada mensaje queda guardado, con el nivel de ayuda usado.
  - **Esta versión usa reglas, no un modelo de lenguaje.** El contrato (`POST /api/publico/intentos/{clave}/mensajes`) está pensado para reemplazarla por el servicio `metis-agents` de la arquitectura sin cambiar la interfaz.
- **Accesibilidad para el estudiante:**
  - Botón para escuchar la pregunta (síntesis de voz del navegador).
  - Alternativas grandes y una pregunta a la vez.
  - Materiales en lectura fácil.

## Datos de ejemplo

- `data/oas.csv` se carga cuando la base está vacía. **Es una muestra parcial** de las Bases Curriculares (Ciencias Naturales de 1° básico completo y algunos OA de Lenguaje, Matemática e Historia), transcrita a mano: **verifícala contra [curriculumnacional.cl](https://www.curriculumnacional.cl)**.
- Para cargar el currículum completo, agrega filas al CSV o usa *Currículum → Importar CSV*. Columnas: `asignatura,nivel,numero,eje,descripcion` (asignatura `LE`, `MA`, `CN` o `HI`; nivel `1B`…`8B` o `1M`…`4M`).
- **Estudiantes, apoderados, conversaciones y entregas de la demo son ficticios.** No cargues datos reales de menores en este entorno.

## Estructura

```
api/   .NET 10 Minimal API + EF Core + PostgreSQL (Npgsql). Endpoints en api/src/Endpoints, lógica en api/src/Domain.
web/   Next.js 15 + React 19 (TypeScript). /api/* se reenvía al API (variable API_URL).
data/  oas.csv, semilla del currículum.
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
