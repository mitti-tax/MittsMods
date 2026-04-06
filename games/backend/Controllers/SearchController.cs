using Microsoft.AspNetCore.Mvc;
using MittsModsApi.DTOs;
using MittsModsApi.Services;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly IgdbService _igdb;

    public SearchController(IgdbService igdb)
    {
        _igdb = igdb;
    }

    [HttpGet]
    public async Task<ActionResult<List<IgdbGameResult>>> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return BadRequest("Search query must be at least 2 characters.");

        var results = await _igdb.SearchAsync(q);
        return Ok(results);
    }
}