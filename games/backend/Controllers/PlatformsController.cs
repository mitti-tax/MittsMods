using Microsoft.AspNetCore.Mvc;
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

    // -------------------------------------------------------
    // GET /api/platforms
    // Returns all platforms — used to populate dropdowns
    // in the frontend add/edit forms
    // -------------------------------------------------------
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var platforms = await _db.Platforms
            .OrderBy(p => p.Name)
            .Select(p => new { p.Id, p.Name, p.Abbreviation })
            .ToListAsync();

        return Ok(platforms);
    }
}