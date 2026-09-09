using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace MittsModsApi.Security;

/// <summary>
/// Issues and validates admin session tokens.
///
/// A token is "v1.&lt;payload&gt;.&lt;signature&gt;" where the payload carries the
/// expiry and a random nonce, and the signature is an HMAC-SHA256 over the
/// payload keyed with a server-side secret. Without that secret a token cannot
/// be produced, so — unlike the previous base64 timestamp — it cannot simply be
/// guessed by anyone who knows what day it is.
/// </summary>
public sealed class AdminTokenService
{
    private const string Version = "v1";

    // Fixed, non-secret salt. The secrecy comes from the password, not from this.
    private static readonly byte[] KeyDerivationSalt =
        Encoding.UTF8.GetBytes("mittsmods.admin.token.v1");

    private readonly AdminAuthOptions _options;
    private readonly ILogger<AdminTokenService> _logger;
    private readonly Lazy<byte[]?> _signingKey;

    public AdminTokenService(IOptions<AdminAuthOptions> options, ILogger<AdminTokenService> logger)
    {
        _options = options.Value;
        _logger = logger;
        _signingKey = new Lazy<byte[]?>(DeriveSigningKey, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    /// <summary>True when an admin password is configured and login is possible.</summary>
    public bool IsConfigured => !string.IsNullOrEmpty(_options.Password);

    public TimeSpan TokenLifetime =>
        TimeSpan.FromHours(Math.Clamp(_options.TokenLifetimeHours, 1, 24 * 30));

    /// <summary>
    /// Constant-time password check, so response timing does not leak how much
    /// of a guessed password was correct.
    /// </summary>
    public bool VerifyPassword(string? candidate)
    {
        var expected = _options.Password;
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(candidate))
            return false;

        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var candidateBytes = Encoding.UTF8.GetBytes(candidate);

        // FixedTimeEquals returns false for different lengths without comparing,
        // so hash both sides first to keep the compared length constant.
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(expectedBytes),
            SHA256.HashData(candidateBytes));
    }

    /// <summary>Issues a signed token valid until <paramref name="expiresAt"/>.</summary>
    public string IssueToken(out DateTimeOffset expiresAt)
    {
        var key = _signingKey.Value
            ?? throw new InvalidOperationException("Admin authentication is not configured.");

        expiresAt = DateTimeOffset.UtcNow.Add(TokenLifetime);

        var nonce = ToBase64Url(RandomNumberGenerator.GetBytes(12));
        var payload = $"{expiresAt.ToUnixTimeSeconds()}.{nonce}";
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        var signature = HMACSHA256.HashData(key, payloadBytes);

        return $"{Version}.{ToBase64Url(payloadBytes)}.{ToBase64Url(signature)}";
    }

    /// <summary>
    /// Validates a token's signature and expiry. Returns false for anything
    /// malformed rather than throwing, so callers can treat it as a plain check.
    /// </summary>
    public bool ValidateToken(string? token)
    {
        var key = _signingKey.Value;
        if (key == null || string.IsNullOrWhiteSpace(token))
            return false;

        var parts = token.Split('.');
        if (parts.Length != 3 || parts[0] != Version)
            return false;

        byte[] payloadBytes;
        byte[] providedSignature;
        try
        {
            payloadBytes = FromBase64Url(parts[1]);
            providedSignature = FromBase64Url(parts[2]);
        }
        catch (FormatException)
        {
            return false;
        }

        var expectedSignature = HMACSHA256.HashData(key, payloadBytes);
        if (!CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature))
            return false;

        // Only parse the payload once the signature proves we wrote it.
        var payload = Encoding.UTF8.GetString(payloadBytes);
        var separator = payload.IndexOf('.');
        if (separator <= 0)
            return false;

        if (!long.TryParse(payload.AsSpan(0, separator), out var expiryUnix))
            return false;

        return DateTimeOffset.FromUnixTimeSeconds(expiryUnix) > DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Pulls a bearer token out of the Authorization header.
    /// </summary>
    public static string? ExtractBearerToken(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header))
            return null;

        const string prefix = "Bearer ";
        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return null;

        var value = header[prefix.Length..].Trim();
        return value.Length == 0 ? null : value;
    }

    private byte[]? DeriveSigningKey()
    {
        if (!string.IsNullOrWhiteSpace(_options.SigningKey))
            return Encoding.UTF8.GetBytes(_options.SigningKey);

        if (string.IsNullOrEmpty(_options.Password))
        {
            _logger.LogError(
                "No admin password configured — admin endpoints are unavailable. " +
                "Set ADMIN_PASSWORD (or AdminAuth:Password) to enable them.");
            return null;
        }

        _logger.LogInformation(
            "Deriving the token signing key from the admin password. " +
            "Set TOKEN_SIGNING_KEY to keep sessions alive across password changes.");

        return Rfc2898DeriveBytes.Pbkdf2(
            password: _options.Password,
            salt: KeyDerivationSalt,
            iterations: 100_000,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);
    }

    private static string ToBase64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch
        {
            2 => padded + "==",
            3 => padded + "=",
            0 => padded,
            _ => throw new FormatException("Invalid base64url string.")
        };
        return Convert.FromBase64String(padded);
    }
}
