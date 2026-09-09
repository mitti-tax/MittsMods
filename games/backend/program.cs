using Microsoft.EntityFrameworkCore;
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

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "https://mitti-tax.github.io",
                "https://mitti-tax.github.io/MittsMods/games/"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
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