using Microsoft.Extensions.Configuration;

namespace Acme.Los.Bff.Api.Infrastructure.State;

public enum BffStateStoreMode
{
  InMemory,
  Redis,
}

public enum BffRedisAuthMode
{
  ConnectionString,
  Entra,
}

public sealed record BffStateStoreOptions(
  BffStateStoreMode Mode,
  BffRedisAuthMode RedisAuthMode,
  string RedisUrl,
  string? RedisHost,
  int RedisPort,
  string RedisKeyPrefix,
  string? ManagedIdentityClientId)
{
  public bool UsesRedis => Mode == BffStateStoreMode.Redis;

  public static BffStateStoreOptions FromConfiguration(IConfiguration configuration)
  {
    var mode = GetStateStoreMode(configuration);
    var authMode = GetRedisAuthMode(configuration);

    return new BffStateStoreOptions(
      mode,
      authMode,
      configuration["ACME_REDIS_URL"]?.Trim() ?? "redis://127.0.0.1:6379",
      configuration["ACME_REDIS_HOST"]?.Trim(),
      GetRedisPort(configuration),
      configuration["ACME_REDIS_KEY_PREFIX"]?.Trim() ?? "acme-los:web",
      configuration["ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID"]?.Trim()
        ?? configuration["AZURE_CLIENT_ID"]?.Trim());
  }

  public string GetRedisEndpoint()
  {
    if (string.IsNullOrWhiteSpace(RedisHost))
    {
      throw new InvalidOperationException(
        "ACME_REDIS_HOST must be set when Redis Entra auth is used.");
    }

    return $"{RedisHost}:{RedisPort}";
  }

  private static BffStateStoreMode GetStateStoreMode(IConfiguration configuration)
  {
    var requestedMode = configuration["ACME_WEB_STATE_STORE"]?.Trim().ToLowerInvariant();

    return requestedMode switch
    {
      "redis" => BffStateStoreMode.Redis,
      "file" => BffStateStoreMode.InMemory,
      null or "" when !string.IsNullOrWhiteSpace(configuration["ACME_REDIS_URL"]) =>
        BffStateStoreMode.Redis,
      null or "" when !string.IsNullOrWhiteSpace(configuration["ACME_REDIS_HOST"]) =>
        BffStateStoreMode.Redis,
      null or "" => BffStateStoreMode.InMemory,
      _ => throw new InvalidOperationException(
        $"Unsupported ACME_WEB_STATE_STORE value '{requestedMode}'. Use 'file' or 'redis'."),
    };
  }

  private static BffRedisAuthMode GetRedisAuthMode(IConfiguration configuration)
  {
    var requestedMode = configuration["ACME_REDIS_AUTH_MODE"]?.Trim().ToLowerInvariant();

    return requestedMode switch
    {
      "entra" => BffRedisAuthMode.Entra,
      "connection-string" => BffRedisAuthMode.ConnectionString,
      null or "" when !string.IsNullOrWhiteSpace(configuration["ACME_REDIS_HOST"]) =>
        BffRedisAuthMode.Entra,
      null or "" => BffRedisAuthMode.ConnectionString,
      _ => throw new InvalidOperationException(
        $"Unsupported ACME_REDIS_AUTH_MODE value '{requestedMode}'. Use 'entra' or 'connection-string'."),
    };
  }

  private static int GetRedisPort(IConfiguration configuration)
  {
    var rawPort = configuration["ACME_REDIS_PORT"]?.Trim();

    if (string.IsNullOrWhiteSpace(rawPort))
    {
      return 10000;
    }

    if (int.TryParse(rawPort, out var port) && port is >= 1 and <= 65535)
    {
      return port;
    }

    throw new InvalidOperationException(
      "ACME_REDIS_PORT must be an integer between 1 and 65535.");
  }
}
