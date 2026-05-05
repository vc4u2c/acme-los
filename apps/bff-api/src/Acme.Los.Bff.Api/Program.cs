using Acme.Los.Bff.Api.Features.Application;
using Acme.Los.Bff.Api.Features.Auth;
using Acme.Los.Bff.Api.Features.Customer;
using Acme.Los.Bff.Api.Features.Observability;
using Acme.Los.Bff.Api.Features.Platform;
using Acme.Los.Bff.Api.Features.Security;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.Security;
using Acme.Los.Bff.Api.Infrastructure.State;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;
using StackExchange.Redis;
using Wolverine;

var builder = WebApplication.CreateBuilder(args);
var stateStoreOptions = BffStateStoreOptions.FromConfiguration(builder.Configuration);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
  options.IncludeScopes = true;
  options.TimestampFormat = "O";
});

builder.Services.AddProblemDetails(options =>
{
  options.CustomizeProblemDetails = context =>
  {
    context.ProblemDetails.Extensions["service"] =
      builder.Environment.ApplicationName;
    context.ProblemDetails.Extensions["environment"] =
      builder.Environment.EnvironmentName;
    context.ProblemDetails.Extensions["requestId"] =
      context.HttpContext.TraceIdentifier;
  };
});

builder.Services.AddOpenApi();
builder.Services.AddSingleton<IAuthSessionService, BootstrapAuthSessionService>();
builder.Services.AddSingleton<ICsrfTokenService, CsrfTokenService>();
builder.Services.AddSingleton(stateStoreOptions);

if (stateStoreOptions.UsesRedis)
{
  var connectionMultiplexer = await RedisConnectionMultiplexerFactory.ConnectAsync(
    stateStoreOptions,
    builder.Environment.ApplicationName);

  builder.Services.AddSingleton(connectionMultiplexer);
  builder.Services.AddSingleton<IConnectionMultiplexer>(connectionMultiplexer);
  builder.Services.AddSingleton<RedisStateStore>();
  builder.Services.AddSingleton<ICustomerProfileStore, RedisCustomerProfileStore>();
  builder.Services.AddSingleton<IApplicationFlowStore, RedisApplicationFlowStore>();
}
else
{
  builder.Services.AddSingleton<ICustomerProfileStore, InMemoryCustomerProfileStore>();
  builder.Services.AddSingleton<IApplicationFlowStore, InMemoryApplicationFlowStore>();
}

var healthChecks = builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["ready"]);

if (stateStoreOptions.UsesRedis)
{
  healthChecks.AddCheck<RedisHealthCheck>("redis", tags: ["ready"]);
}

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(
            serviceName: builder.Environment.ApplicationName,
            serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0")
        .AddAttributes(
            new[]
            {
                new KeyValuePair<string, object>("deployment.environment", builder.Environment.EnvironmentName),
            }))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddConsoleExporter());

builder.Host.UseWolverine();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
  app.UseExceptionHandler();
}

app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
  app.MapOpenApi();
  app.MapScalarApiReference(options => options.WithTitle("ACME LOS BFF"));
}

app.UseHttpsRedirection();

app.MapGet("/", (IHostEnvironment environment) => Results.Ok(new ServiceInfo(
    environment.ApplicationName,
    environment.EnvironmentName,
    typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0")))
    .WithName("GetServiceInfo");

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
  Predicate = _ => false,
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
  Predicate = registration => registration.Tags.Contains("ready"),
});

app.MapBffHealthEndpoints();
app.MapBffAuthFlowEndpoints();
app.MapBffCsrfEndpoints();
app.MapBffAuthSessionEndpoints();
app.MapBffCustomerEndpoints();
app.MapBffApplicationEndpoints();
app.MapBffObservabilityEndpoints();

app.Run();

internal sealed record ServiceInfo(string Name, string Environment, string Version);

public partial class Program;
