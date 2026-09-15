using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IgdbService>();
builder.Services.AddHttpClient<SteamService>();

// --- Connection string ---
// Defaults to a local SQLite file; override in production via the
// ConnectionStrings__DefaultConnection env var (ASP.NET Core's config
// system binds "__" as a section separator automatically), pointed at
// a path on a persistent volume.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=mittsmods.db";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "https://mitti-tax.github.io"
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