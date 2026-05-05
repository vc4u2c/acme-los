FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo

COPY apps/bff-api/Directory.Packages.props apps/bff-api/
COPY apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj apps/bff-api/src/Acme.Los.Bff.Api/
RUN dotnet restore apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj

COPY apps/bff-api apps/bff-api
RUN dotnet publish apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj \
  --configuration Release \
  --no-restore \
  --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runner
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_RUNNING_IN_CONTAINER=true

COPY --from=build /app/publish .

EXPOSE 8080

ENTRYPOINT ["dotnet", "Acme.Los.Bff.Api.dll"]
