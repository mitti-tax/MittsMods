using Microsoft.AspNetCore.Mvc;
using MittsModsApi.DTOs;
using MittsModsApi.Services;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SteamController(SteamSync sync) : ControllerBase
{
    // POST /api/steam/sync: imports the Steam library now (see SteamSync; it also runs every 6 hours)
    [HttpPost("sync")]
    public async Task<ActionResult<SteamSyncResult>> Sync() =>
        await sync.RunAsync() is { } result ? Ok(result) : Conflict("A Steam sync is already running.");
}
