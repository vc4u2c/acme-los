namespace Acme.Los.Bff.Api.Contracts;

public sealed record CustomerProfile(
  string Email,
  string Phone,
  string StreetAddress,
  string AddressLine2,
  string City,
  string State,
  string ZipCode);

public sealed record GetCustomerProfileResponse(CustomerProfile Profile);

public sealed record UpdateCustomerProfileRequest(CustomerProfile Profile);

public sealed record UpdateCustomerProfileResponse(CustomerProfile Profile);
