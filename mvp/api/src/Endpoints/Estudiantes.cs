using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record EstudianteRequest(
    string Rut, string Nombre, string Apellido, DateOnly? FechaNacimiento, int? CursoId,
    string? Diagnostico, int? NivelTea, TipoPie TipoPie, string? Observaciones);

public static class EstudiantesEndpoints
{
    public static void MapEstudiantes(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estudiantes").RequireAuthorization();

        // Estudiantes de los cursos del profesor, más los que aún no tienen curso.
        IQueryable<Estudiante> Visibles(AppDb db, ClaimsPrincipal user)
        {
            var profeId = user.ProfesorId();
            return db.Estudiantes.Where(e => e.CursoId == null || e.Curso!.ProfesorId == profeId);
        }

        g.MapGet("/", async (int? cursoId, string? q, ClaimsPrincipal user, AppDb db) =>
        {
            var query = Visibles(db, user);
            if (cursoId is not null) query = query.Where(e => e.CursoId == cursoId);
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(e => EF.Functions.ILike(e.Nombre + " " + e.Apellido, $"%{q.Trim()}%") || e.Rut.Contains(q.Trim()));
            return await query.OrderBy(e => e.Apellido).ThenBy(e => e.Nombre)
                .Select(e => new
                {
                    e.Id, e.Rut, e.Nombre, e.Apellido, e.FechaNacimiento, e.CursoId,
                    Curso = e.Curso == null ? null : e.Curso.Nivel.Nombre + " " + e.Curso.Letra,
                    e.Diagnostico, e.NivelTea, TipoPie = e.TipoPie.ToString(), e.Observaciones,
                })
                .ToListAsync();
        });

        g.MapPost("/", async (EstudianteRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var (rut, error) = await Validar(req, null, user, db);
            if (error is not null) return error;
            var e = new Estudiante { Rut = rut!, Nombre = req.Nombre.Trim(), Apellido = req.Apellido.Trim() };
            Aplicar(e, req);
            db.Estudiantes.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/api/estudiantes/{e.Id}", new { e.Id });
        });

        g.MapPut("/{id:int}", async (int id, EstudianteRequest req, ClaimsPrincipal user, AppDb db) =>
        {
            var e = await Visibles(db, user).SingleOrDefaultAsync(x => x.Id == id);
            if (e is null) return Results.NotFound();
            var (rut, error) = await Validar(req, id, user, db);
            if (error is not null) return error;
            if (e.CursoId != req.CursoId)
                await db.Exclusiones.Where(x => x.EstudianteId == id).ExecuteDeleteAsync();
            e.Rut = rut!; e.Nombre = req.Nombre.Trim(); e.Apellido = req.Apellido.Trim();
            Aplicar(e, req);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, AppDb db) =>
        {
            var borrados = await Visibles(db, user).Where(e => e.Id == id).ExecuteDeleteAsync();
            return borrados == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static void Aplicar(Estudiante e, EstudianteRequest req)
    {
        e.FechaNacimiento = req.FechaNacimiento;
        e.CursoId = req.CursoId;
        e.Diagnostico = string.IsNullOrWhiteSpace(req.Diagnostico) ? null : req.Diagnostico.Trim();
        e.NivelTea = req.NivelTea;
        e.TipoPie = req.TipoPie;
        e.Observaciones = string.IsNullOrWhiteSpace(req.Observaciones) ? null : req.Observaciones.Trim();
    }

    private static async Task<(string? Rut, IResult? Error)> Validar(EstudianteRequest req, int? id, ClaimsPrincipal user, AppDb db)
    {
        var rut = Rut.Normalizar(req.Rut);
        if (rut is null) return (null, Results.Problem("RUT inválido (revisa el dígito verificador)", statusCode: 400));
        if (string.IsNullOrWhiteSpace(req.Nombre) || string.IsNullOrWhiteSpace(req.Apellido))
            return (null, Results.Problem("Nombre y apellido son obligatorios", statusCode: 400));
        if (req.NivelTea is not null and not (1 or 2 or 3))
            return (null, Results.Problem("El nivel TEA debe ser 1, 2 o 3", statusCode: 400));
        if (req.CursoId is not null && await db.CursoPropio(req.CursoId.Value, user) is null)
            return (null, Results.Problem("Curso inválido", statusCode: 400));
        if (await db.Estudiantes.AnyAsync(e => e.Rut == rut && e.Id != id))
            return (null, Results.Problem("Ya existe un estudiante con ese RUT", statusCode: 409));
        return (rut, null);
    }
}
