using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Seed;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record OaRequest(int AsignaturaId, int NivelId, int Numero, string? Eje, string Descripcion);

public static partial class CurriculumEndpoints
{
    [System.Text.RegularExpressions.GeneratedRegex(@"^([A-Z]{2})\s*(\d{2}|\dM)\s*OA\s*(\d{1,2})$")]
    private static partial System.Text.RegularExpressions.Regex CodigoOficialRegex();

    [System.Text.RegularExpressions.GeneratedRegex(@"^OA\s*(\d{1,2})$")]
    private static partial System.Text.RegularExpressions.Regex SoloOaRegex();

    public static void MapCurriculum(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        g.MapGet("/asignaturas", (AppDb db) =>
            db.Asignaturas.OrderBy(a => a.Nombre).Select(a => new { a.Id, a.Codigo, a.Nombre, a.Color }).ToListAsync());

        g.MapGet("/niveles", async (AppDb db) =>
            (await db.Niveles.OrderBy(n => n.Orden).ToListAsync())
                .Select(n => new { n.Id, n.Codigo, n.Nombre, n.Ciclo }));

        // OA del currículum, con los cursos del profesor donde están asignados.
        g.MapGet("/oas", async (int? asignaturaId, int? nivelId, string? q, ClaimsPrincipal user, AppDb db) =>
        {
            var query = db.Objetivos.Include(o => o.Asignatura).Include(o => o.Nivel).AsQueryable();
            if (asignaturaId is not null) query = query.Where(o => o.AsignaturaId == asignaturaId);
            if (nivelId is not null) query = query.Where(o => o.NivelId == nivelId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                var codigo = CodigoOficialRegex().Match(term.ToUpperInvariant());
                if (codigo.Success)
                {
                    // Código oficial completo, ej: "CN01 OA 03" o "LE1M OA 2".
                    var asig = codigo.Groups[1].Value;
                    var nivel = codigo.Groups[2].Value;
                    var num = int.Parse(codigo.Groups[3].Value);
                    query = query.Where(o => o.Asignatura.Codigo == asig && o.Nivel.CodigoMineduc == nivel && o.Numero == num);
                }
                else
                {
                    var soloOa = SoloOaRegex().Match(term.ToUpperInvariant());
                    var numero = soloOa.Success ? int.Parse(soloOa.Groups[1].Value) : -1;
                    query = query.Where(o => o.Numero == numero
                        || EF.Functions.ILike(o.Descripcion, $"%{term}%")
                        || (o.Eje != null && EF.Functions.ILike(o.Eje, $"%{term}%")));
                }
            }
            var oas = await query.OrderBy(o => o.Nivel.Orden).ThenBy(o => o.Asignatura.Nombre).ThenBy(o => o.Numero).ToListAsync();

            var profeId = user.ProfesorId();
            var asignaciones = await db.CursoObjetivos
                .Where(c => c.Curso.ProfesorId == profeId)
                .Select(c => new { c.ObjetivoId, c.CursoId, Curso = c.Curso.Nivel.Nombre + " " + c.Curso.Letra, c.Curso.Anio })
                .ToListAsync();
            var porOa = asignaciones.ToLookup(a => a.ObjetivoId);

            return oas.Select(o => Dtos.Oa(o) with
            {
                Cursos = porOa[o.Id].OrderBy(x => x.Curso).Select(x => new CursoRef(x.CursoId, x.Curso, x.Anio)).ToList(),
            });
        });

        g.MapPost("/oas", async (OaRequest req, AppDb db) =>
        {
            if (Validar(req) is { } error) return error;
            if (await db.Objetivos.AnyAsync(o => o.AsignaturaId == req.AsignaturaId && o.NivelId == req.NivelId && o.Numero == req.Numero))
                return Results.Problem($"Ya existe el OA {req.Numero} para esa asignatura y nivel", statusCode: 409);
            var oa = new ObjetivoAprendizaje
            {
                AsignaturaId = req.AsignaturaId, NivelId = req.NivelId, Numero = req.Numero,
                Eje = string.IsNullOrWhiteSpace(req.Eje) ? null : req.Eje.Trim(), Descripcion = req.Descripcion.Trim(),
            };
            db.Objetivos.Add(oa);
            await db.SaveChangesAsync();
            return Results.Created($"/api/oas/{oa.Id}", new { oa.Id });
        });

        g.MapPut("/oas/{id:int}", async (int id, OaRequest req, AppDb db) =>
        {
            if (Validar(req) is { } error) return error;
            var oa = await db.Objetivos.FindAsync(id);
            if (oa is null) return Results.NotFound();
            if (await db.Objetivos.AnyAsync(o => o.Id != id && o.AsignaturaId == req.AsignaturaId && o.NivelId == req.NivelId && o.Numero == req.Numero))
                return Results.Problem($"Ya existe el OA {req.Numero} para esa asignatura y nivel", statusCode: 409);
            oa.AsignaturaId = req.AsignaturaId; oa.NivelId = req.NivelId; oa.Numero = req.Numero;
            oa.Eje = string.IsNullOrWhiteSpace(req.Eje) ? null : req.Eje.Trim();
            oa.Descripcion = req.Descripcion.Trim();
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/oas/{id:int}", async (int id, AppDb db) =>
        {
            if (await db.CursoObjetivos.AnyAsync(c => c.ObjetivoId == id))
                return Results.Problem("El OA está asignado a uno o más cursos. Quítalo de esos cursos antes de eliminarlo.", statusCode: 409);
            if (await db.Preguntas.AnyAsync(p => p.ObjetivoId == id))
                return Results.Problem("El OA se usa en preguntas de evaluaciones. No se puede eliminar.", statusCode: 409);
            var borrados = await db.Objetivos.Where(o => o.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });

        // Carga masiva: CSV con encabezado asignatura,nivel,numero,eje,descripcion
        g.MapPost("/oas/importar", async (HttpRequest request, AppDb db) =>
        {
            using var reader = new StreamReader(request.Body);
            var resultado = await CsvImporter.ImportarAsync(db, await reader.ReadToEndAsync());
            return Results.Ok(resultado);
        }).Accepts<string>("text/csv", "text/plain");
    }

    private static IResult? Validar(OaRequest req)
    {
        if (req.Numero <= 0) return Results.Problem("El número de OA debe ser mayor que 0", statusCode: 400);
        if (string.IsNullOrWhiteSpace(req.Descripcion)) return Results.Problem("La descripción es obligatoria", statusCode: 400);
        return null;
    }
}
