using System.Text.Json.Serialization;
using MetisCurriculum.Api.Data;
using MetisCurriculum.Api.Endpoints;
using MetisCurriculum.Api.Seed;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddAuthentication(BearerTokenDefaults.AuthenticationScheme)
    .AddBearerToken(o => o.BearerTokenExpiration = TimeSpan.FromHours(12));
builder.Services.AddAuthorization();

// Persistir las llaves para que los tokens sobrevivan reinicios del contenedor.
var keysPath = builder.Configuration["DataProtection:KeysPath"];
if (!string.IsNullOrEmpty(keysPath))
    builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keysPath));

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:3000"])
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => new { message = "API Metis Curriculum funcionando ✅", version = "0.1 - .NET 10" });
app.MapAuth();
app.MapCurriculum();
app.MapCursos();
app.MapEstudiantes();
app.MapPlanificaciones();
app.MapDashboard();

// MVP: el esquema se crea al iniciar (sin migraciones). Ver README para pasar a migraciones.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    for (var intento = 1; ; intento++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            break;
        }
        catch (Exception ex) when (intento < 15)
        {
            logger.LogWarning("Base de datos no disponible ({Mensaje}); reintento {Intento}/15", ex.Message, intento);
            await Task.Delay(2000);
        }
    }
    await Seeder.RunAsync(db, app.Configuration, logger);
}

app.Run();
