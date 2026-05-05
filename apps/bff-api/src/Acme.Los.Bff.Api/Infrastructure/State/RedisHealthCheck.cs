using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;

namespace Acme.Los.Bff.Api.Infrastructure.State;

internal sealed class RedisHealthCheck : IHealthCheck
{
  private readonly IConnectionMultiplexer _connectionMultiplexer;

  public RedisHealthCheck(IConnectionMultiplexer connectionMultiplexer)
  {
    _connectionMultiplexer = connectionMultiplexer;
  }

  public async Task<HealthCheckResult> CheckHealthAsync(
    HealthCheckContext context,
    CancellationToken cancellationToken = default)
  {
    try
    {
      var latency = await _connectionMultiplexer.GetDatabase().PingAsync()
        .WaitAsync(cancellationToken);

      return HealthCheckResult.Healthy(
        "Redis state store reachable.",
        new Dictionary<string, object>
        {
          ["latencyMs"] = latency.TotalMilliseconds,
        });
    }
    catch (Exception exception)
    {
      return HealthCheckResult.Unhealthy(
        "Redis state store unavailable.",
        exception);
    }
  }
}
