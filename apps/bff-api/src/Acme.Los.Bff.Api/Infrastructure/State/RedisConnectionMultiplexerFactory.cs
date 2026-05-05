using Azure.Identity;
using Microsoft.Azure.StackExchangeRedis;
using StackExchange.Redis;

namespace Acme.Los.Bff.Api.Infrastructure.State;

internal static class RedisConnectionMultiplexerFactory
{
  public static async Task<IConnectionMultiplexer> ConnectAsync(
    BffStateStoreOptions options,
    string clientName)
  {
    var configurationOptions = options.RedisAuthMode switch
    {
      BffRedisAuthMode.Entra => await CreateEntraConfigurationOptionsAsync(options),
      _ => CreateConnectionStringConfigurationOptions(options),
    };

    configurationOptions.ClientName = clientName;
    configurationOptions.AbortOnConnectFail = false;
    configurationOptions.ConnectRetry = Math.Max(configurationOptions.ConnectRetry, 3);
    configurationOptions.ConnectTimeout =
      configurationOptions.ConnectTimeout > 0 ? configurationOptions.ConnectTimeout : 5000;
    configurationOptions.AsyncTimeout =
      configurationOptions.AsyncTimeout > 0 ? configurationOptions.AsyncTimeout : 5000;
    configurationOptions.KeepAlive =
      configurationOptions.KeepAlive > 0 ? configurationOptions.KeepAlive : 60;

    return await ConnectionMultiplexer.ConnectAsync(configurationOptions);
  }

  private static ConfigurationOptions CreateConnectionStringConfigurationOptions(
    BffStateStoreOptions options)
  {
    if (!options.RedisUrl.Contains("://", StringComparison.Ordinal))
    {
      return ConfigurationOptions.Parse(options.RedisUrl);
    }

    var redisUri = new Uri(options.RedisUrl, UriKind.Absolute);

    if (
      !string.Equals(redisUri.Scheme, "redis", StringComparison.OrdinalIgnoreCase)
      && !string.Equals(redisUri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase))
    {
      throw new InvalidOperationException(
        "ACME_REDIS_URL must use the redis:// or rediss:// scheme.");
    }

    var configurationOptions = new ConfigurationOptions
    {
      Ssl = string.Equals(redisUri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase),
      SslHost = redisUri.Host,
    };

    configurationOptions.EndPoints.Add(
      redisUri.Host,
      redisUri.IsDefaultPort
        ? GetDefaultPort(redisUri.Scheme)
        : redisUri.Port);

    ApplyCredentials(configurationOptions, redisUri.UserInfo);

    if (
      redisUri.AbsolutePath.Length > 1
      && int.TryParse(redisUri.AbsolutePath.Trim('/'), out var databaseIndex))
    {
      configurationOptions.DefaultDatabase = databaseIndex;
    }

    return configurationOptions;
  }

  private static async Task<ConfigurationOptions> CreateEntraConfigurationOptionsAsync(
    BffStateStoreOptions options)
  {
    var configurationOptions = new ConfigurationOptions
    {
      Protocol = RedisProtocol.Resp3,
      Ssl = true,
      SslHost = options.RedisHost,
    };

    configurationOptions.EndPoints.Add(options.GetRedisEndpoint());

    var credentialOptions = new DefaultAzureCredentialOptions();

    if (!string.IsNullOrWhiteSpace(options.ManagedIdentityClientId))
    {
      credentialOptions.ManagedIdentityClientId = options.ManagedIdentityClientId;
    }

    await configurationOptions.ConfigureForAzureWithTokenCredentialAsync(
      new DefaultAzureCredential(credentialOptions));

    return configurationOptions;
  }

  private static int GetDefaultPort(string scheme)
  {
    return string.Equals(scheme, "rediss", StringComparison.OrdinalIgnoreCase)
      ? 6380
      : 6379;
  }

  private static void ApplyCredentials(
    ConfigurationOptions configurationOptions,
    string userInfo)
  {
    if (string.IsNullOrWhiteSpace(userInfo))
    {
      return;
    }

    var separatorIndex = userInfo.IndexOf(':');

    if (separatorIndex < 0)
    {
      configurationOptions.Password = Uri.UnescapeDataString(userInfo);
      return;
    }

    if (separatorIndex > 0)
    {
      configurationOptions.User =
        Uri.UnescapeDataString(userInfo[..separatorIndex]);
    }

    if (separatorIndex < userInfo.Length - 1)
    {
      configurationOptions.Password =
        Uri.UnescapeDataString(userInfo[(separatorIndex + 1)..]);
    }
  }
}
