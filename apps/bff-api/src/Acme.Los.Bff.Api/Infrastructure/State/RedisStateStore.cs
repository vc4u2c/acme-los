using System.Text.Json;
using StackExchange.Redis;

namespace Acme.Los.Bff.Api.Infrastructure.State;

internal sealed class RedisStateStore
{
  private static readonly JsonSerializerOptions SerializerOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
  };

  private readonly IDatabase _database;
  private readonly BffStateStoreOptions _options;

  public RedisStateStore(
    IConnectionMultiplexer connectionMultiplexer,
    BffStateStoreOptions options)
  {
    _database = connectionMultiplexer.GetDatabase();
    _options = options;
  }

  public async ValueTask<T?> ReadAsync<T>(
    string @namespace,
    string key,
    CancellationToken cancellationToken)
    where T : class
  {
    var redisKey = CreateRedisKey(@namespace, key);
    var rawValue = await _database.StringGetAsync(redisKey).WaitAsync(cancellationToken);

    if (rawValue.IsNullOrEmpty)
    {
      return null;
    }

    PersistedStateRecord<T>? record;

    try
    {
      record = JsonSerializer.Deserialize<PersistedStateRecord<T>>(
        rawValue.ToString(),
        SerializerOptions);
    }
    catch (JsonException)
    {
      record = null;
    }

    if (
      record is null
      || record.Value is null
      || record.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
    {
      await _database.KeyDeleteAsync(redisKey).WaitAsync(cancellationToken);
      return null;
    }

    return record.Value;
  }

  public async ValueTask WriteAsync<T>(
    string @namespace,
    string key,
    T value,
    TimeSpan timeToLive,
    CancellationToken cancellationToken)
    where T : class
  {
    var record = new PersistedStateRecord<T>(
      DateTimeOffset.UtcNow.Add(timeToLive).ToUnixTimeMilliseconds(),
      value);
    var payload = JsonSerializer.Serialize(record, SerializerOptions);

    await _database.StringSetAsync(CreateRedisKey(@namespace, key), payload, timeToLive)
      .WaitAsync(cancellationToken);
  }

  public async ValueTask DeleteAsync(
    string @namespace,
    string key,
    CancellationToken cancellationToken)
  {
    await _database.KeyDeleteAsync(CreateRedisKey(@namespace, key))
      .WaitAsync(cancellationToken);
  }

  private string CreateRedisKey(string @namespace, string key)
  {
    return $"{_options.RedisKeyPrefix}:{@namespace}:{key}";
  }

  private sealed record PersistedStateRecord<T>(
    long ExpiresAt,
    T Value)
    where T : class;
}
