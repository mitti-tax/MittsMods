using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MittsModsApi.DTOs;
using MittsModsApi.Security;
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

    /// <summary>
    /// GET /api/search?q= — IGDB title lookup.
    /// Admin only: it is only reachable from the add-game form, and it spends
    /// a shared third-party quota that anyone could otherwise drain.
    /// </summary>
    [HttpGet]
    [AdminOnly]
    [EnableRateLimiting(RateLimitPolicies.External)]
    public async Task<ActionResult<List<IgdbGameResult>>> Search(
        [FromQuery, Required, StringLength(100, MinimumLength = 2)] string q,
        CancellationToken cancellationToken)
    {
        return Ok(await _igdb.SearchAsync(q, cancellationToken));
    }
}
