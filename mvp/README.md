# Metis Curriculum · Profes TEA (MVP)

Mantenedor de mallas curriculares chilenas por **curso, nivel y Objetivo de Aprendizaje (OA)**, pensado para profesores que trabajan con estudiantes TEA y del Programa de Integración Escolar (PIE).

Es una demo para mostrar al equipo. Todavía no incluye el núcleo de Metis, que es **la IA que guía a los estudiantes**. Construye la base sobre la que ese agente va a trabajar: cursos, OA, adecuaciones y planificaciones.

## Levantarlo en local

Requisitos: Docker Desktop (o Docker Engine con Compose).

```bash
docker compose up --build
```

| Servicio | URL |
|---|---|
| App web | http://localhost:3000 |
| API | http://localhost:8080/api/health |
| PostgreSQL | localhost:5432 (metis / metis) |

**Usuario demo:** `profe@metis.cl` / `metis123`. Para usar otros, copia `.env.example` a `.env` antes del primer arranque.

Para empezar desde cero (borra los datos): `docker compose down -v && docker compose up --build`.

## Qué incluye

- **Dashboard:** cursos, estudiantes, OA asignados, planificaciones y estudiantes por diagnóstico.
- **Mis Cursos:** crear cursos (nivel + letra + año) y asignarles OA.
  - **Excluir estudiantes** de un OA puntual, como adecuación curricular.
  - **Panorama del curso:** estudiantes PIE permanentes y transitorios, insignias de diagnóstico (TEA con nivel, TDA-H, TL…), OA por asignatura y adecuaciones.
  - **Nómina** del curso.
- **Estudiantes:** ficha con RUT (valida el dígito verificador), curso, diagnóstico, nivel TEA (1 a 3) y participación PIE.
- **Currículum (OA):** el mantenedor.
  - Filtros por asignatura y nivel, y búsqueda por código o texto.
  - Crear, editar y eliminar OA.
  - Asignar varios OA a un curso a la vez.
  - **Importar CSV**.
- **Planificación:** planificación semanal por curso, con OA del curso, actividades y adecuaciones TEA.
- Materiales, Notas y Guía IA quedan como *próximamente*.

## Datos

- `data/oas.csv` se carga automáticamente cuando la base está vacía.
- **Es una muestra parcial**, transcrita de las Bases Curriculares de MINEDUC:
  - Ciencias Naturales 1° básico completo.
  - Algunos OA de Lenguaje, Matemática e Historia de 1° básico.
  - Algunos OA de 8° básico.
- **Verifica los textos contra [curriculumnacional.cl](https://www.curriculumnacional.cl) antes de usarlos en serio.** Para cargar el currículum completo, agrega filas al CSV o usa *Importar CSV* en la app. Si un OA ya existe, se actualiza.
- Formato del CSV:

  ```csv
  asignatura,nivel,numero,eje,descripcion
  CN,1B,1,Ciencias de la vida,"Reconocer y observar, por medio de la exploración, ..."
  ```

  - `asignatura`: `LEN`, `MAT`, `CN` o `HIS`.
  - `nivel`: `1B`…`8B` o `1M`…`4M`.
- **Los estudiantes de demo son ficticios**: los nombres y RUT son generados. No cargues datos reales de menores en esta demo.

## Arquitectura

```
web/   Next.js 15 + React 19 (TypeScript). /api/* hace de proxy al API (variable API_URL).
api/   .NET 10 Minimal API + EF Core + Npgsql. Autenticación con bearer tokens de ASP.NET Core.
data/  oas.csv (semilla del currículum).
```

El stack es el mismo que propone la arquitectura de Metis (`metis-docs`): Next.js, .NET 10 y PostgreSQL. Así, este código puede migrar después a `metis-api` y `metis-studio`.

### Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login, devuelve `accessToken` |
| GET | `/api/oas?asignaturaId&nivelId&q` | Buscar OA |
| POST/PUT/DELETE | `/api/oas[/{id}]` | Mantenedor de OA |
| POST | `/api/oas/importar` | Carga masiva (CSV en el cuerpo) |
| GET/POST/PUT/DELETE | `/api/cursos[/{id}]` | Cursos del profesor |
| GET/POST/DELETE | `/api/cursos/{id}/oas[/{oaId}]` | OA asignados al curso |
| GET/PUT | `/api/cursos/{id}/oas/{oaId}/exclusiones` | Estudiantes excluidos de un OA |
| GET | `/api/cursos/{id}/panorama` | Panorama PIE del curso |
| GET/POST/PUT/DELETE | `/api/estudiantes[/{id}]` | Estudiantes |
| GET/POST/PUT/DELETE | `/api/planificaciones[/{id}]` | Planificación semanal |

### Desarrollo sin Docker

```bash
# Base de datos
docker compose up -d db
# API (requiere .NET 10 SDK)
cd api/src && Seed__OasCsv=../../data/oas.csv dotnet run --urls http://localhost:8080
# Web (Node 22)
cd web && npm install && API_URL=http://localhost:8080 npm run dev
```

## Limitaciones conocidas (es un MVP)

- El esquema se crea con `EnsureCreated` y no hay migraciones. Si cambia el modelo, hay que recrear la base con `docker compose down -v`. Al pasar a producción hay que cambiarlo por migraciones de EF Core.
- El login es solo para la demo: no hay registro, recuperación de contraseña ni roles más allá de profesor.
- Cada profesor ve solo sus cursos, pero el currículum (OA) es compartido y cualquier profesor puede editarlo.
