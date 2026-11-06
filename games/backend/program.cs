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

// DATABASE_URL (key=value, set by docker-compose) or appsettings for local runs
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

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
    var needsAdmin = (!isRead && !path.StartsWithSegments("/api/auth")) || path.StartsWithSegments("/api/search");
    if (needsAdmin && !AdminToken.IsAdmin(ctx))
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
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
