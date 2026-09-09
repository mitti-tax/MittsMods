using System.Globalization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.Security;
using MittsModsApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------
// Options
// ---------------------------------------------------------------
builder.Services.AddOptions<AdminAuthOptions>()
    .Bind(builder.Configuration.GetSection(AdminAuthOptions.SectionName))
    .PostConfigure(options =>
    {
        // Fall back to the legacy config key and the ADMIN_PASSWORD env var
        // that the Railway deployment already sets.
        if (string.IsNullOrWhiteSpace(options.Password))
        {
            options.Password = builder.Configuration["AdminPassword"]
                ?? Environment.GetEnvironmentVariable("ADMIN_PASSWORD");
        }

        if (string.IsNullOrWhiteSpace(options.SigningKey))
        {
            options.SigningKey = builder.Configuration["TokenSigningKey"]
                ?? Environment.GetEnvironmentVariable("TOKEN_SIGNING_KEY");
        }
    });

builder.Services.AddSingleton<AdminTokenService>();

// ---------------------------------------------------------------
// MVC + serialisation
// ---------------------------------------------------------------
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Enum-typed DTO fields still travel as "Backlog" / "Original" strings,
        // which keeps the wire format identical for existing clients.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddMemoryCache();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<UpstreamExceptionHandler>();

builder.Services.AddHttpClient<IgdbService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("MittsMods-GameLog/1.0");
});

builder.Services.AddHttpClient<SteamService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("MittsMods-GameLog/1.0");
});

// ---------------------------------------------------------------
// Database
// Railway provides DATABASE_URL as a postgres:// URI, which Npgsql
// needs in key=value form.
// ---------------------------------------------------------------
var rawUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(rawUrl))
{
    throw new InvalidOperationException(
        "No database configured. Set DATABASE_URL or ConnectionStrings:DefaultConnection.");
}

// Railway's internal Postgres presents a self-signed certificate, so the
// default trusts it. Set DATABASE_TRUST_SERVER_CERTIFICATE=false when the
// database presents a certificate from a real CA.
var trustServerCertificate = !string.Equals(
    Environment.GetEnvironmentVariable("DATABASE_TRUST_SERVER_CERTIFICATE"),
    "false",
    StringComparison.OrdinalIgnoreCase);

var connectionString = ConvertDatabaseUrl(rawUrl, trustServerCertificate);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsql =>
    {
        // Railway containers and their database can wake at different speeds.
        npgsql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null);
        npgsql.CommandTimeout(30);
    }));

// ---------------------------------------------------------------
// CORS — origins are scheme + host + port only, never a path.
// ---------------------------------------------------------------
var configuredOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>();

var allowedOrigins = (configuredOrigins is { Length: > 0 }
        ? configuredOrigins
        : new[] { "http://localhost:5173", "http://localhost:4173", "https://mitti-tax.github.io" })
    .Select(NormaliseOrigin)
    .Where(origin => origin is not null)
    .Select(origin => origin!)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy => policy
        .WithOrigins(allowedOrigins)
        .WithHeaders("Content-Type", "Authorization")
        .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .SetPreflightMaxAge(TimeSpan.FromHours(1)));
});

// ---------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------
builder.Services.AddRateLimiter(limiter =>
{
    limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    limiter.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 300,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    // Password guessing is the thing worth slowing down hardest.
    limiter.AddPolicy(RateLimitPolicies.Login, context =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0
        }));

    // Endpoints that spend the IGDB / Steam quota.
    limiter.AddPolicy(RateLimitPolicies.External, context =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    limiter.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString(NumberFormatInfo.InvariantInfo);
        }

        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            title = "Too many requests",
            detail = "Slow down and try again shortly.",
            status = StatusCodes.Status429TooManyRequests
        }, cancellationToken);
    };
});

// ---------------------------------------------------------------
// Transport
// ---------------------------------------------------------------
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[] { "application/problem+json" });
});

// Endpoints opt in with [OutputCache]; nothing is cached by default.
builder.Services.AddOutputCache();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    // Railway terminates TLS in front of the container, so the scheme and the
    // client IP only survive in the forwarded headers.
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();

// Keep the token-bearing auth responses out of the compressor.
app.UseWhen(
    context => !context.Request.Path.StartsWithSegments("/api/auth"),
    branch => branch.UseResponseCompression());

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Referrer-Policy"] = "no-referrer";
    headers["X-Frame-Options"] = "DENY";
    await next();
});

app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
app.UseRateLimiter();
app.UseOutputCache();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/health", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var databaseReachable = await db.Database.CanConnectAsync(cancellationToken);
    return databaseReachable
        ? Results.Ok(new { status = "healthy", database = "up" })
        : Results.Json(
            new { status = "degraded", database = "down" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
}).DisableRateLimiting();

using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    try
    {
        db.Database.Migrate();
        logger.LogInformation("Database migrations applied.");
    }
    catch (Exception ex)
    {
        // Serving requests against a half-migrated schema is worse than
        // failing loudly, so surface it and let the platform restart us.
        logger.LogCritical(ex, "Failed to apply database migrations.");
        throw;
    }

    var tokens = scope.ServiceProvider.GetRequiredService<AdminTokenService>();
    if (!tokens.IsConfigured)
    {
        logger.LogWarning(
            "ADMIN_PASSWORD is not set — the library is read only until it is configured.");
    }

    logger.LogInformation("CORS allows: {Origins}", string.Join(", ", allowedOrigins));
}

app.Run();

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

static string ClientKey(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

// Reduces a configured value to a bare origin. CORS matches on
// scheme + host + port, so a value with a path never matches anything.
static string? NormaliseOrigin(string? value)
{
    if (string.IsNullOrWhiteSpace(value))
        return null;

    return Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)
        ? uri.GetLeftPart(UriPartial.Authority)
        : null;
}

static string ConvertDatabaseUrl(string url, bool trustServerCertificate)
{
    url = url.Trim();

    if (!url.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
        !url.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        return url; // already in Npgsql key=value format
    }

    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':', 2);

    // Credentials arrive percent-encoded in a URI; Npgsql wants them raw.
    var username = Uri.UnescapeDataString(userInfo[0]);
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
    var host = uri.Host;
    var port = uri.Port > 0 ? uri.Port : 5432;
    var database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));

    var connection = new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = host,
        Port = port,
        Database = database,
        Username = username,
        Password = password,
        SslMode = Npgsql.SslMode.Require,
        TrustServerCertificate = trustServerCertificate
    };

    return connection.ConnectionString;
}
