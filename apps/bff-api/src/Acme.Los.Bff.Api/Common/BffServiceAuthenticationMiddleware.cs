namespace Acme.Los.Bff.Api.Common;

internal sealed class BffServiceAuthenticationMiddleware
{
  private readonly RequestDelegate _next;
  private readonly BffServiceAuthenticationOptions _options;
  private readonly IBffServiceTokenValidator _tokenValidator;
  private readonly ILogger<BffServiceAuthenticationMiddleware> _logger;

  public BffServiceAuthenticationMiddleware(
    RequestDelegate next,
    BffServiceAuthenticationOptions options,
    IBffServiceTokenValidator tokenValidator,
    ILogger<BffServiceAuthenticationMiddleware> logger)
  {
    _next = next;
    _options = options;
    _tokenValidator = tokenValidator;
    _logger = logger;
  }

  public async Task InvokeAsync(HttpContext context)
  {
    if (
      !_options.IsRequired
      || !context.Request.Path.StartsWithSegments("/bff"))
    {
      await _next(context);
      return;
    }

    if (!_options.IsFullyConfigured)
    {
      _logger.LogError(
        "BFF service authentication is enabled but required configuration is missing.");
      await WriteRejectedResultAsync(context);
      return;
    }

    var bearerToken = ReadBearerToken(context.Request);

    if (bearerToken is null)
    {
      await WriteRejectedResultAsync(context);
      return;
    }

    var validation = await _tokenValidator.ValidateAsync(
      bearerToken,
      context.RequestAborted);

    if (!validation.IsValid)
    {
      await WriteRejectedResultAsync(context);
      return;
    }

    BffServiceAuthentication.MarkTrustedServiceIdentity(context, validation);
    await _next(context);
  }

  private static string? ReadBearerToken(HttpRequest request)
  {
    var authorizationHeader = request.Headers.Authorization.ToString().Trim();

    if (string.IsNullOrWhiteSpace(authorizationHeader))
    {
      return null;
    }

    var parts = authorizationHeader.Split(
      ' ',
      2,
      StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    return parts.Length == 2
      && string.Equals(parts[0], "Bearer", StringComparison.OrdinalIgnoreCase)
      && !string.IsNullOrWhiteSpace(parts[1])
      ? parts[1]
      : null;
  }

  private static async Task WriteRejectedResultAsync(HttpContext context)
  {
    context.Response.StatusCode = StatusCodes.Status403Forbidden;
    await context.Response.WriteAsJsonAsync(
      new { error = "A trusted BFF service identity is required." },
      context.RequestAborted);
  }
}
