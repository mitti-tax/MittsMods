using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MittsModsApi.Security;

/// <summary>
/// Requires a valid admin bearer token. Apply to every endpoint that changes
/// data or spends an external API quota — the frontend hiding a button is a
/// convenience, not a control.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class AdminOnlyAttribute : TypeFilterAttribute
{
    public AdminOnlyAttribute() : base(typeof(AdminOnlyFilter)) { }
}

internal sealed class AdminOnlyFilter : IAuthorizationFilter
{
    private readonly AdminTokenService _tokens;
    private readonly ILogger<AdminOnlyFilter> _logger;

    public AdminOnlyFilter(AdminTokenService tokens, ILogger<AdminOnlyFilter> logger)
    {
        _tokens = tokens;
        _logger = logger;
    }

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        if (!_tokens.IsConfigured)
        {
            _logger.LogError("Admin endpoint called but no admin password is configured.");
            context.Result = new ObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status503ServiceUnavailable,
                Title = "Admin access is not configured",
                Detail = "This server has no admin password set, so write operations are disabled."
            })
            { StatusCode = StatusCodes.Status503ServiceUnavailable };
            return;
        }

        var token = AdminTokenService.ExtractBearerToken(context.HttpContext.Request);
        if (_tokens.ValidateToken(token))
            return;

        _logger.LogWarning(
            "Rejected unauthenticated {Method} {Path} from {Ip}",
            context.HttpContext.Request.Method,
            context.HttpContext.Request.Path,
            context.HttpContext.Connection.RemoteIpAddress);

        context.Result = new ObjectResult(new ProblemDetails
        {
            Status = StatusCodes.Status401Unauthorized,
            Title = "Authentication required",
            Detail = "Log in as admin to make changes to the library."
        })
        { StatusCode = StatusCodes.Status401Unauthorized };
    }
}
