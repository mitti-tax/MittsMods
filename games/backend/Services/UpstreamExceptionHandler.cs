using Microsoft.AspNetCore.Diagnostics;

namespace MittsModsApi.Services;

/// <summary>
/// Turns <see cref="UpstreamServiceException"/> into a 502 with a message the
/// UI can show. Everything else falls through to the default handler, which
/// keeps exception details out of the response.
/// </summary>
internal sealed class UpstreamExceptionHandler : IExceptionHandler
{
    private readonly ILogger<UpstreamExceptionHandler> _logger;

    public UpstreamExceptionHandler(ILogger<UpstreamExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not UpstreamServiceException upstream)
            return false;

        _logger.LogError(upstream, "Upstream call to {Service} failed", upstream.Service);

        httpContext.Response.StatusCode = StatusCodes.Status502BadGateway;
        await httpContext.Response.WriteAsJsonAsync(new
        {
            title = $"{upstream.Service} is unavailable",
            detail = upstream.Message,
            status = StatusCodes.Status502BadGateway
        }, cancellationToken);

        return true;
    }
}
