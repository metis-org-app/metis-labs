using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Beta.Messages;

namespace MetisCurriculum.Api.Domain.Ia;

/// Acceso a Claude (Anthropic). Si no hay API key configurada, Disponible es false y quien lo usa
/// recurre a la versión sin IA (reglas o esquema de ejemplo), de modo que la app funciona igual.
public class ClienteIa
{
    private readonly AnthropicClient? _cliente;
    private readonly ILogger<ClienteIa> _logger;

    public string Modelo { get; }
    public bool Disponible => _cliente is not null;

    public ClienteIa(IConfiguration config, ILogger<ClienteIa> logger)
    {
        _logger = logger;
        Modelo = config["Ia:Modelo"] is { Length: > 0 } m ? m : "claude-opus-5-5";
        var apiKey = config["Ia:ApiKey"] is { Length: > 0 } k ? k : Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        if (!string.IsNullOrWhiteSpace(apiKey))
            _cliente = new AnthropicClient { ApiKey = apiKey };
    }

    /// Pide a Claude una respuesta JSON que cumple el esquema dado. Devuelve null si la IA no está
    /// disponible, si el modelo declina la solicitud o si la llamada falla (el detalle queda en el log).
    public async Task<JsonElement?> JsonAsync(
        string sistema, List<BetaContentBlockParam> contenido, object esquema, string esfuerzo, int maxTokens,
        List<BetaMessageParam>? historial = null, CancellationToken ct = default)
    {
        if (_cliente is null) return null;
        var mensajes = new List<BetaMessageParam>(historial ?? []) { new() { Role = Role.User, Content = contenido } };
        try
        {
            var respuesta = await _cliente.Beta.Messages.Create(new MessageCreateParams
            {
                Model = Modelo,
                MaxTokens = maxTokens,
                // Si un clasificador de seguridad declina la solicitud, la API la reintenta con otro modelo.
                Betas = ["server-side-fallback-2026-07-01"],
                Fallbacks = new BetaFallbacksParam(JsonSerializer.SerializeToElement("default")),
                // El prompt de sistema es fijo por tipo de tarea: se cachea entre llamadas.
                System = new List<BetaTextBlockParam> { new() { Text = sistema, CacheControl = new BetaCacheControlEphemeral() } },
                Messages = mensajes,
                OutputConfig = new BetaOutputConfig
                {
                    Effort = esfuerzo,
                    Format = new BetaJsonOutputFormat
                    {
                        Schema = JsonSerializer.SerializeToElement(esquema).EnumerateObject()
                            .ToDictionary(p => p.Name, p => p.Value.Clone()),
                    },
                },
            }, ct);

            if (respuesta.StopReason == "refusal")
            {
                _logger.LogWarning("Claude declinó la solicitud ({Categoria})", respuesta.StopDetails?.Category);
                return null;
            }
            if (respuesta.StopReason == "max_tokens")
            {
                _logger.LogWarning("La respuesta de Claude se cortó por max_tokens ({Max})", maxTokens);
                return null;
            }
            var texto = string.Concat(respuesta.Content.Select(b => b.TryPickText(out var t) ? t.Text : ""));
            return JsonDocument.Parse(texto).RootElement.Clone();
        }
        catch (AnthropicRateLimitException ex)
        {
            _logger.LogWarning("Límite de uso de la API de Claude: {Mensaje}", ex.Message);
        }
        catch (AnthropicApiException ex)
        {
            _logger.LogError("Error de la API de Claude: {Mensaje}", ex.Message);
        }
        catch (JsonException ex)
        {
            _logger.LogError("Claude devolvió un JSON inválido: {Mensaje}", ex.Message);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError("No se pudo conectar con la API de Claude: {Mensaje}", ex.Message);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            _logger.LogError("La llamada a Claude superó el tiempo de espera");
        }
        return null;
    }

    public static BetaContentBlockParam Texto(string texto) => new BetaTextBlockParam { Text = texto };

    public static BetaContentBlockParam Pdf(byte[] datos, string titulo) => new BetaRequestDocumentBlock
    {
        Source = new BetaBase64PdfSource { Data = Convert.ToBase64String(datos) },
        Title = titulo,
    };
}
