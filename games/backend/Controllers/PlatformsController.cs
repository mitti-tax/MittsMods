using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlatformsController : ControllerBase
{
    private readonly AppDbContext _db;

    public PlatformsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// GET /api/platforms — populates the add/edit dropdowns.
    /// Seed data that effectively never changes, so it is cached rather than
    /// re-queried on every page load.
    /// </summary>
    [HttpGet]
    [OutputCache(Duration = 3600)]
    public async Task<ActionResult<List<PlatformDto>>> GetAll(CancellationToken cancellationToken)
    {
        var platforms = await _db.Platforms
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(p => new PlatformDto(p.Id, p.Name, p.Abbreviation))
            .ToListAsync(cancellationToken);

        Response.Headers.CacheControl = "public, max-age=3600";

        return Ok(platforms);
    }
}

public record PlatformDto(int Id, string Name, string? Abbreviation);
