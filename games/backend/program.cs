using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.Services;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddControllers();

// SQLite via Entity Framework Core
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// In-memory cache — used by IgdbService for token + search result caching
builder.Services.AddMemoryCache();

// HttpClient + Services
builder.Services.AddHttpClient<IgdbService>();
builder.Services.AddHttpClient<SteamService>();

// CORS — allow the React frontend to talk to this API
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "https://mitti-tax.github.io/MittsMods/"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// --- Middleware ---
app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
app.UseAuthorization();
app.MapControllers();

// Auto-apply any pending EF migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.Run();