namespace MittsModsApi.Services;

/// <summary>
/// Raised when a third-party API (IGDB, Steam) fails. Surfaces as a 502 rather
/// than an opaque 500, so the frontend can say "Steam is unreachable" instead
/// of "something went wrong".
/// </summary>
public sealed class UpstreamServiceException : Exception
{
    public UpstreamServiceException(string service, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Service = service;
    }

    public string Service { get; }
}
