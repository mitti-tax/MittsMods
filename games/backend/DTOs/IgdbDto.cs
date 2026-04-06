namespace MittsModsApi.DTOs;

public class IgdbGameResult
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string? CoverUrl { get; set; }
    public int? ReleaseYear { get; set; }
    public List<string> Genres { get; set; } = new();
    public List<string> Developers { get; set; } = new();
}

public class IgdbRawGame
{
    public int id { get; set; }
    public string? name { get; set; }
    public string? summary { get; set; }
    public IgdbRawCover? cover { get; set; }
    public long? first_release_date { get; set; }
    public List<IgdbRawGenre>? genres { get; set; }
    public List<IgdbRawInvolvedCompany>? involved_companies { get; set; }
}

public class IgdbRawCover
{
    public string? url { get; set; }
}

public class IgdbRawGenre
{
    public string? name { get; set; }
}

public class IgdbRawInvolvedCompany
{
    public bool developer { get; set; }
    public IgdbRawCompany? company { get; set; }
}

public class IgdbRawCompany
{
    public string? name { get; set; }
}