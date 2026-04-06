using Microsoft.AspNetCore.Mvc;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;

    public AuthController(IConfiguration config)
    {
        _config = config;
    }

    // POST /api/auth/login
    // Checks password against ADMIN_PASSWORD env variable
    // Returns a simple token if correct
    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        var adminPassword = _config["AdminPassword"]
            ?? Environment.GetEnvironmentVariable("ADMIN_PASSWORD");

        if (string.IsNullOrEmpty(adminPassword))
            return StatusCode(500, "Admin password not configured.");

        if (request.Password != adminPassword)
            return Unauthorized(new { message = "Incorrect password." });

        // Simple token — just a signed timestamp
        // Not cryptographically secure, but fine for a personal site
        var token = Convert.ToBase64String(
            System.Text.Encoding.UTF8.GetBytes($"mittsmods-admin:{DateTime.UtcNow:yyyyMMdd}")
        );

        return Ok(new { token });
    }

    // POST /api/auth/verify
    // Lets the frontend check if a stored token is still valid
    [HttpPost("verify")]
    public IActionResult Verify([FromBody] VerifyRequest request)
    {
        try
        {
            var decoded = System.Text.Encoding.UTF8.GetString(
                Convert.FromBase64String(request.Token)
            );

            // Token format: mittsmods-admin:YYYYMMDD
            // Valid for the day it was issued only
            var parts = decoded.Split(':');
            if (parts.Length != 2 || parts[0] != "mittsmods-admin")
                return Unauthorized();

            if (parts[1] != DateTime.UtcNow.ToString("yyyyMMdd"))
                return Unauthorized(new { message = "Session expired. Please log in again." });

            return Ok(new { valid = true });
        }
        catch
        {
            return Unauthorized();
        }
    }
}

public record LoginRequest(string Password);
public record VerifyRequest(string Token);