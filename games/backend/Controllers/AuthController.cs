using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

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
    // Checks the password against ADMIN_PASSWORD and returns a signed token
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        var secret = AdminToken.Secret(_config);
        if (string.IsNullOrEmpty(secret))
            return StatusCode(500, "Admin password not configured.");

        // Compare hashes in constant time so response timing doesn't leak the password
        var ok = CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(request.Password)),
            SHA256.HashData(Encoding.UTF8.GetBytes(secret))
        );
        if (!ok)
            return Unauthorized(new { message = "Incorrect password." });

        return Ok(new { token = AdminToken.Create(secret) });
    }

    // POST /api/auth/verify
    // Lets the frontend check if a stored token is still valid
    [HttpPost("verify")]
    public IActionResult Verify([FromBody] VerifyRequest request)
    {
        var secret = AdminToken.Secret(_config);
        return !string.IsNullOrEmpty(secret) && AdminToken.IsValid(request.Token, secret)
            ? Ok(new { valid = true })
            : Unauthorized(new { message = "Session expired. Please log in again." });
    }
}

public record LoginRequest(string Password);

public record VerifyRequest(string Token);

// Token format: "<expiry unix seconds>.<HMAC-SHA256 of that expiry>", keyed by the admin password.
// It can't be forged without the password, and changing ADMIN_PASSWORD invalidates every token.
public static class AdminToken
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public static string? Secret(IConfiguration config) =>
        config["AdminPassword"] ?? config["ADMIN_PASSWORD"];

    public static string Create(string secret)
    {
        var expiry = DateTimeOffset.UtcNow.Add(Lifetime).ToUnixTimeSeconds().ToString();
        return $"{expiry}.{Sign(expiry, secret)}";
    }

    public static bool IsValid(string? token, string secret)
    {
        var parts = token?.Split('.');
        if (parts is not { Length: 2 } || !long.TryParse(parts[0], out var expiry))
            return false;
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expiry)
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(parts[1]),
            Encoding.ASCII.GetBytes(Sign(parts[0], secret))
        );
    }

    private static string Sign(string payload, string secret) =>
        Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload))
        );
}
