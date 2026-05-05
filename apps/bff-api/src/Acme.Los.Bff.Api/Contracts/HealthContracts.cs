namespace Acme.Los.Bff.Api.Contracts;

public sealed record HealthSnapshot(
    string Status,
    string Service,
    string Version,
    string? Build,
    string Environment,
    string InstanceId,
    int ProcessId,
    string ServedAt);
