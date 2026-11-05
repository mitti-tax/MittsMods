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
// Railway provides DATABASE_URL as a postgres:// URI
// Npgsql needs it converted to key=value format
var rawUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

var connectionString = ConvertDatabaseUrl(rawUrl!);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// Slows down password guessing on /api/auth/login
// ponytail: one global bucket (behind the tunnel every client shares an IP anyway); per-IP needs CF-Connecting-IP
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddFixedWindowLimiter("login", w =>
    {
        w.PermitLimit = 5;
        w.Window = TimeSpan.FromMinutes(1);
    });
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

app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
app.UseRateLimiter();

// Every write needs a valid admin token, except logging in itself.
// Runs after CORS so a 401 still reaches the browser with CORS headers.
app.Use(async (ctx, next) =>
{
    var method = ctx.Request.Method;
    var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
    if (!isRead && !ctx.Request.Path.StartsWithSegments("/api/auth"))
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