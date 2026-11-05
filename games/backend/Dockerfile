FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Restore first so this layer is cached until the csproj changes
COPY Mittsmodsapi.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
# Non-root user built into the .NET images
USER $APP_UID
ENTRYPOINT ["dotnet", "Mittsmodsapi.dll"]
