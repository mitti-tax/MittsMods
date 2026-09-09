using System.ComponentModel.DataAnnotations;

namespace MittsModsApi.Validation;

/// <summary>
/// Validates that a string matches one of the names of an enum, so a typo in a
/// payload is a 400 with a useful message instead of a silently wrong value.
/// Null passes — use <see cref="RequiredAttribute"/> when a value is mandatory.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class EnumNameAttribute : ValidationAttribute
{
    private readonly Type _enumType;

    public EnumNameAttribute(Type enumType)
    {
        if (!enumType.IsEnum)
            throw new ArgumentException($"{enumType.Name} is not an enum.", nameof(enumType));

        _enumType = enumType;
    }

    public override bool IsValid(object? value)
    {
        if (value is null)
            return true;

        if (value is not string text || string.IsNullOrWhiteSpace(text))
            return false;

        return Enum.GetNames(_enumType).Contains(text, StringComparer.OrdinalIgnoreCase);
    }

    public override string FormatErrorMessage(string name) =>
        $"{name} must be one of: {string.Join(", ", Enum.GetNames(_enumType))}.";
}
