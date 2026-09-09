using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MittsModsApi.Security;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AdminTokenService _tokens;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AdminTokenService tokens, ILogger<AuthController> logger)
    {
        _tokens = tokens;
        _logger = logger;
    }

    /// <summary>
    /// POST /api/auth/login — exchanges the admin password for a signed session
    /// token. Rate limited per IP so the password cannot be brute forced.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<LoginResponse> Login([FromBody] LoginRequest request)
    {
        if (!_tokens.IsConfigured)
        {
            _logger.LogError("Login attempted but no admin password is configured.");
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Admin access is not configured",
                detail: "This server has no admin password set.");
        }

        if (!_tokens.VerifyPassword(request.Password))
        {
            _logger.LogWarning(
                "Failed admin login from {Ip}", HttpContext.Connection.RemoteIpAddress);
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Incorrect password",
                detail: "Incorrect password.");
        }

        var token = _tokens.IssueToken(out var expiresAt);
        _logger.LogInformation(
            "Admin logged in from {Ip}", HttpContext.Connection.RemoteIpAddress);

        return Ok(new LoginResponse(token, expiresAt));
    }

    /// <summary>
    /// POST /api/auth/verify — checks whether a stored token is still usable.
    /// Accepts the token in the Authorization header (preferred) or the body,
    /// so older clients keep working.
    /// </summary>
    [HttpPost("verify")]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    public ActionResult<VerifyResponse> Verify([FromBody] VerifyRequest? request)
    {
        var token = AdminTokenService.ExtractBearerToken(Request) ?? request?.Token;

        if (!_tokens.ValidateToken(token))
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Session expired",
                detail: "Session expired. Please log in again.");

        return Ok(new VerifyResponse(true));
    }
}

public class LoginRequest
{
    [Required(AllowEmptyStrings = false)]
    [StringLength(256, MinimumLength = 1)]
    public string Password { get; set; } = string.Empty;
}

public class VerifyRequest
{
    public string? Token { get; set; }
}

public record LoginResponse(string Token, DateTimeOffset ExpiresAt);

public record VerifyResponse(bool Valid);
