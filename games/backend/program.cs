using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Controllers;
using MittsModsApi.Data;
using MittsModsApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IgdbService>();
builder.Services.AddHttpClient<SteamService>();

// --- Connection string ---
// DATABASE_URL may be a postgres:// URI (hosted Postgres) or key=value (docker-compose)
// Npgsql needs it converted to key=value format
var rawUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

var connectionString = ConvertDatabaseUrl(rawUrl!);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// Slows down password guessing on /api/auth/login: 5 tries a minute per visitor.
// Behind the Cloudflare tunnel every request comes from cloudflared, so the visitor is
// CF-Connecting-IP (set by Cloudflare; the API port is only open on the server's loopback).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Request.Headers["CF-Connecting-IP"].FirstOrDefault()
            ?? ctx.Connection.RemoteIpAddress?.ToString()
            ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "https://mitti-tax.github.io",
                "https://mittsmods.com"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// No UseHttpsRedirection: Cloudflare terminates HTTPS and the container only speaks HTTP
app.UseCors("FrontendPolicy");
app.UseRateLimiter();

// Every write needs a valid admin token, except logging in itself.
// IGDB search too: only the admin's Add Game form uses it, and each call spends our IGDB quota.
// Runs after CORS so a 401 still reaches the browser with CORS headers.
app.Use(async (ctx, next) =>
{
    var method = ctx.Request.Method;
    var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
    var path = ctx.Request.Path;
    if ((!isRead && !path.StartsWithSegments("/api/auth")) || path.StartsWithSegments("/api/search"))
    {
        var secret = AdminToken.Secret(ctx.RequestServices.GetRequiredService<IConfiguration>());
        var header = ctx.Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ") ? header["Bearer ".Length..] : null;
        if (string.IsNullOrEmpty(secret) || !AdminToken.IsValid(token, secret))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }
    await next();
});
app.UseAuthorization();
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.Run();

static string ConvertDatabaseUrl(string url)
{
    if (!url.StartsWith("postgres://") && !url.StartsWith("postgresql://"))
        return url; // already in Npgsql format

    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':');
    var username = userInfo[0];
    var password = userInfo.Length > 1 ? userInfo[1] : string.Empty;
    var host     = uri.Host;
    var port     = uri.Port > 0 ? uri.Port : 5432;
    var database = uri.AbsolutePath.TrimStart('/');

    return $"Host={host};Port={port};Database={database};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true";
}