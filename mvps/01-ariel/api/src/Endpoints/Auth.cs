using System.Security.Claims;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Domain;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.EntityFrameworkCore;

namespace MetisCurriculum.Api.Endpoints;

public record LoginRequest(string Email, string Password);

public static class AuthEndpoints
{
    public static int ProfesorId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth");

        g.MapPost("/login", async (LoginRequest req, AppDb db) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var profe = await db.Profesores.SingleOrDefaultAsync(p => p.Email == email);
            if (profe is null || !Passwords.Verificar(req.Password, profe.PasswordHash))
                return Results.Problem("Email o contraseña incorrectos", statusCode: 401);

            var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, profe.Id.ToString()),
                new Claim(ClaimTypes.Name, profe.Nombre),
                new Claim(ClaimTypes.Email, profe.Email),
                new Claim(ClaimTypes.Role, profe.Rol),
            ], BearerTokenDefaults.AuthenticationScheme);

            return Results.SignIn(new ClaimsPrincipal(identity), authenticationScheme: BearerTokenDefaults.AuthenticationScheme);
        });

        g.MapGet("/me", async (ClaimsPrincipal user, AppDb db) =>
        {
            var profe = await db.Profesores.FindAsync(user.ProfesorId());
            return profe is null
                ? Results.Unauthorized()
                : Results.Ok(new { profe.Id, profe.Nombre, profe.Email, profe.Rol });
        }).RequireAuthorization();
    }
}
