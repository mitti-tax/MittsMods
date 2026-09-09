namespace MittsModsApi.Security;

/// <summary>
/// Configuration for the single-admin authentication scheme.
/// Bound from the "AdminAuth" section, with fallbacks to the legacy
/// "AdminPassword" key and the ADMIN_PASSWORD environment variable so
/// existing deployments keep working without a config change.
/// </summary>
public sealed class AdminAuthOptions
{
    public const string SectionName = "AdminAuth";

    /// <summary>The admin password. Never logged, never returned to a client.</summary>
    public string? Password { get; set; }

    /// <summary>
    /// Key used to sign session tokens. Optional — when it is not set the key is
    /// derived from the password, which still makes tokens unforgeable without it.
    /// Set it explicitly (TOKEN_SIGNING_KEY) if you want existing sessions to
    /// survive a password change, or to share sessions across instances.
    /// </summary>
    public string? SigningKey { get; set; }

    /// <summary>How long an issued token stays valid.</summary>
    public int TokenLifetimeHours { get; set; } = 12;
}
