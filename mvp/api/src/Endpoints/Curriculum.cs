using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using MetisCurriculum.Api.Seed;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record OaRequest(int AsignaturaId, int NivelId, int Numero, string? Eje, string Descripcion);

public static class CurriculumEndpoints
{
    public static void MapCurriculum(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        g.MapGet("/asignaturas", (AppDb db) =>
            db.Asignaturas.OrderBy(a => a.Nombre).Select(a => new { a.Id, a.Codigo, a.Nombre }).ToListAsync());

        g.MapGet("/niveles", (AppDb db) =>
            db.Niveles.OrderBy(n => n.Orden).Select(n => new { n.Id, n.Codigo, n.Nombre }).ToListAsync());

        g.MapGet("/oas", async (int? asignaturaId, int? nivelId, string? q, AppDb db) =>
        {
            var query = db.Objetivos.AsQueryable();
            if (asignaturaId is not null) query = query.Where(o => o.AsignaturaId == asignaturaId);
            if (nivelId is not null) query = query.Where(o => o.NivelId == nivelId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                var numero = int.TryParse(term.ToUpperInvariant().Replace("OA", "").Trim(), out var n) ? n : -1;
                query = query.Where(o => o.Numero == numero
                    || EF.Functions.ILike(o.Descripcion, $"%{term}%")
                    || (o.Eje != null && EF.Functions.ILike(o.Eje, $"%{term}%")));
            }
            return await query
                .OrderBy(o => o.Nivel.Orden).ThenBy(o => o.Asignatura.Nombre).ThenBy(o => o.Numero)
                .Select(o => new
                {
                    o.Id, Codigo = "OA" + o.Numero, o.Numero, o.Eje, o.Descripcion,
                    o.AsignaturaId, Asignatura = o.Asignatura.Nombre,
                    o.NivelId, Nivel = o.Nivel.Nombre, NivelOrden = o.Nivel.Orden,
                })
                .ToListAsync();
        });

        g.MapPost("/oas", async (OaRequest req, AppDb db) =>
        {
            if (Validar(req) is { } error) return error;
            if (await db.Objetivos.AnyAsync(o => o.AsignaturaId == req.AsignaturaId && o.NivelId == req.NivelId && o.Numero == req.Numero))
                return Results.Problem($"Ya existe el OA{req.Numero} para esa asignatura y nivel", statusCode: 409);
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
                return Results.Problem($"Ya existe el OA{req.Numero} para esa asignatura y nivel", statusCode: 409);
            oa.AsignaturaId = req.AsignaturaId; oa.NivelId = req.NivelId; oa.Numero = req.Numero;
            oa.Eje = string.IsNullOrWhiteSpace(req.Eje) ? null : req.Eje.Trim();
            oa.Descripcion = req.Descripcion.Trim();
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/oas/{id:int}", async (int id, AppDb db) =>
        {
            if (await db.CursoObjetivos.AnyAsync(c => c.ObjetivoId == id))
                return Results.Problem("El OA está asignado a uno o más cursos; quítalo de los cursos antes de eliminarlo", statusCode: 409);
            var borrados = await db.Objetivos.Where(o => o.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });

        // Carga masiva: CSV separado por ';' con encabezado asignatura;nivel;numero;eje;descripcion
        g.MapPost("/oas/importar", async (HttpRequest request, AppDb db) =>
        {
            using var reader = new StreamReader(request.Body);
            var csv = await reader.ReadToEndAsync();
            var resultado = await CsvImporter.ImportarAsync(db, csv);
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
