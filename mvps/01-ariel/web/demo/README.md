# Demo de presentación (Netlify)

Versión del MVP para mostrar en presentaciones, publicada en Netlify, sin API ni base de datos. La web es la misma. Cuando se compila con `NEXT_PUBLIC_DEMO=1`, `lib/api.ts` entrega cada llamada a `/api/...` a `demo/servidor.ts`, que responde en el navegador con las mismas rutas y formas que la API .NET.

Sin esa variable (Docker o `npm run dev`), la app usa la API real como siempre. Nada de esta carpeta se ejecuta.

## Qué hay aquí

| Archivo | Qué hace |
|---|---|
| `servidor.ts` | Las 49 rutas de `api/src/Endpoints`, en TypeScript. |
| `dominio.ts` | Reglas de `api/src/Domain`: nota 1,0–7,0, corrección, RUT y Metis con reglas pedagógicas. |
| `banco.ts` | Preguntas de ejemplo para "Generar con IA" en los OA de 1° básico. Para otros OA se usa el esquema de ejemplo de la API. |
| `estado.ts` | Datos en `localStorage` (`metis.demo.v1`). Las fechas de la semilla se ajustan a la fecha actual. |
| `datos/semilla.json`, `datos/oas.json` | Lo que siembra la API (`Seeder.cs` y el currículum oficial), exportado desde PostgreSQL. |

En la demo:

- Lo que cada persona crea queda solo en su navegador. **✦ Demo → Restablecer demo** vuelve a los datos de ejemplo.
- La IA está simulada. Metis responde con las reglas de `AsistenteMetis.cs`, "Generar con IA" toma preguntas del banco de ejemplo y "Dudas frecuentes" agrupa por pregunta.
- De los archivos subidos solo se lee el texto de `.txt`, `.md` y `.csv`. Se pueden descargar únicamente en la misma sesión.
- No se importan OA por CSV.

## Publicar en Netlify

La demo vive en la rama `demo/netlify` y no se mergea a `main`, así el MVP real no cambia.

1. En Netlify: **Add new site → Import an existing project → GitHub → `metis-org-app/metis-labs`**.
2. **Branch to deploy:** `demo/netlify`.
3. **Base directory:** `mvps/01-ariel/web`. El resto lo toma de `netlify.toml`: Node 22, `NEXT_PUBLIC_DEMO=1` y el adaptador de Next.js.
4. **Deploy.** Cada push a `demo/netlify` vuelve a publicar.

Para actualizar la demo con cambios del MVP: `git checkout demo/netlify && git merge origin/main` y push.

Usuario: `profe@metis.cl` / `metis123` (la contraseña aparece escrita). Para el estudiante, abre `/rendir/seres-vivos-1a` y entra con un RUT de la nómina, por ejemplo `26.100.005-9` (Agustín, que todavía no la rinde).

## Probarla en local

```bash
cd mvps/01-ariel/web
NEXT_PUBLIC_DEMO=1 npm run dev
```

## Si cambia la API

Si cambia una ruta o un DTO en `api/src/Endpoints`, hay que replicar el cambio en `servidor.ts`.

Si cambia la semilla (`Seeder.cs`) o el currículum, regenera los datos:

1. Levanta la API sobre una base vacía (`docker compose down -v && docker compose up --build`).
2. Exporta:

   ```bash
   python3 tools/demo/exportar_semilla.py web/demo/datos
   ```
