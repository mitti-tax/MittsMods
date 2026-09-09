namespace MittsModsApi.Security;

/// <summary>Names of the rate limiting policies configured in program.cs.</summary>
public static class RateLimitPolicies
{
    /// <summary>Strict per-IP limit for password attempts.</summary>
    public const string Login = "login";

    /// <summary>Per-IP limit for endpoints that spend a third-party API quota.</summary>
    public const string External = "external";
}
