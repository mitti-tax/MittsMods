# MittsMods - Games Database

A personal game tracking and logging application. Tracks every game played across my personal Steam Library, and includes sync, IGDB metadata, achievements, ratings, and personal notes.

**Live:** [mittsmods.com/games](https://mittsmods.com/games)  
**API:** [api.mittsmods.com](https://api.mittsmods.com)

---

## Stack

| Layer    | Tech                                                |
| -------- | --------------------------------------------------- |
| Frontend | React + TypeScript (Vite), deployed to GitHub Pages |
| Backend  | C# ASP.NET Core 10 Web API, self-hosted in Docker   |
| Database | PostgreSQL via Entity Framework Core                |
| APIs     | Steam Web API, IGDB via Twitch OAuth                |
| Hosting  | Docker Compose + Cloudflare Tunnel; Pages for the UI |

---

## Features

- **Steam sync**: imports the library with hours, last-played dates and achievements. Runs by itself when the API starts and every 6 hours, or on demand with Sync Steam. Games played in the last two weeks come in as Playing, the rest as Backlog. Later syncs move a Backlog game to Playing when Steam shows recent playtime, and a Playing game back to Backlog after two weeks without play (unless it was set to Playing within those two weeks). Other statuses you've set are never touched.
- **IGDB integration**: cover art, genres, developers and typical time to beat. "Edit Details" re-matches a game that IGDB got wrong; syncs never overwrite stored details, so your fixes stay.
- **Personal log**: status (Backlog / Playing / Completed / Dropped / On hold / Wishlist), hours, rating (tap the stars), notes, play mode, hardware, and start/finish dates that fill themselves in. Every status change is kept as history.
- **Several platforms per game**: log the same game on PC and Switch, each with its own hours and status.
- **Dashboard**: recently played slideshow, stats, currently playing, favourites and recently added.
- **Library**: search, filters (status, platform, genre, hardware, decade), sort, grid or list view. Filters live in the URL, so links and Back work.
- **Bulk edit**: select games in Edit Mode and change status, platform or visibility in one go, with Undo. Status and platform changes apply to each game's main entry.
- **Hide**: hidden games drop out of the library and stats, and only the admin can see them. Deleting a Steam game hides it, so the next sync doesn't add it back.
- **Stats**: status breakdown, hours by platform, top genres, most played, and a year in review.
- **What should I play?**: random pick from the backlog.
- **Export**: CSV or JSON download of the whole library.
- **Works offline**: the last library loaded is kept on the device, so the app opens instantly; pull down to refresh.
- **Role-based access**: guests browse; admin login is needed to change anything.
- **iPhone-native on phones**: tab bar, large titles, bottom sheets, landscape layout, home-screen icon. Sidebar and keyboard shortcuts (press `?`) on desktop.
- **Blog tie-ins**: the mittsmods.com homepage shows what's being played, and each console post links to that console's games.

---

## Project Structure

```
games/
├── backend/
│   ├── Controllers/    # GamesController, PlatformsController, SearchController, SteamController, AuthController
│   ├── Data/           # EF Core DbContext, migrations
│   ├── DTOs/           # Request/response models
│   ├── Models/         # Game, Platform, UserEntry, StatusChange
│   ├── Services/       # IgdbService, SteamService
│   └── program.cs
└── frontend/
    └── src/
        ├── api/        # Centralised API client
        ├── components/ # GameCard, GameSheet, AddGameSheet, EntryFields, LoginModal, sheets
        ├── hooks/      # useAuth, useLibrary, useEscape
        ├── lib/        # Sorting, filters, URL state, CSV (tested: npm test)
        └── pages/      # Dashboard, GamesPage (All Games and Backlog), Stats
```

---

## Local Development

### Prerequisites

- .NET 10 SDK
- Node.js 22+
- PostgreSQL (local instance)

### Backend

```bash
cd games/backend
dotnet restore
dotnet ef database update   # also runs automatically on startup
dotnet run
```

Create `appsettings.Development.json` with:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=mittsmods;Username=postgres;Password=yourpassword"
  },
  "Twitch": {
    "ClientId": "your_twitch_client_id",
    "ClientSecret": "your_twitch_client_secret"
  },
  "Steam": {
    "ApiKey": "your_steam_api_key",
    "SteamId": "your_steam64_id"
  },
  "AdminPassword": "your_admin_password"
}
```

API runs at: `http://localhost:5000`

### Frontend

```bash
cd games/frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

---

## Deployment

| Service  | Platform                         | Trigger                                       |
| -------- | -------------------------------- | --------------------------------------------- |
| Frontend | GitHub Pages (`mittsmods.com`)   | Push to `main` (blog or `games/frontend/`)    |
| Backend  | Docker Compose on a home server  | Manual: `docker compose up -d --build`        |

`.github/workflows/deploy.yml` builds and deploys the blog and the game library together, so the two never race for the `gh-pages` branch. CI (`.github/workflows/ci.yml`) lints, tests and builds the frontend and builds the backend on every push and pull request, and fails if a model change has no migration.

The API, Postgres, a nightly backup job and `cloudflared` run from [`docker-compose.yml`](docker-compose.yml). Nothing is
exposed to the network; `api.mittsmods.com` reaches the API through the Cloudflare tunnel. Database migrations run when the API starts.

```bash
cp .env.example .env && chmod 600 .env   # fill in secrets
docker compose up -d --build
ADMIN_PASSWORD='...' ./check-auth.sh      # confirms unauthenticated writes are rejected
```

Deploy the backend before pushing frontend changes that use new API endpoints.

### Backups

The `backup` service writes `backups/mittsmods-YYYY-MM-DD.sql.gz` every 24 hours and keeps 14 days. Copy that folder off the server as well. To restore:

```bash
gunzip -c backups/mittsmods-2026-11-05.sql.gz | docker compose exec -T db psql -U mittsmods -d mittsmods
```

---

## Milestones

- [x] M1 — Project setup, EF Core schema, platform seed data
- [x] M2 — Core backend API (CRUD endpoints, DTOs)
- [x] M3 — IGDB integration (game search, cover art, metadata)
- [x] M4 — Steam integration (library sync, achievements)
- [x] M5 — React frontend (dashboard, game library, add/edit/delete)
- [x] M6 — Dashboard stats, recently played slideshow
- [x] M7 — PostgreSQL migration, Railway deployment (since moved to self-hosted Docker), GitHub Actions CI/CD, auth, mobile UI
