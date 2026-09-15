# MittsMods - Games Database

A personal game tracking and logging application. Tracks every game played across my personal Steam Library, and includes sync, IGDB metadata, achievements, ratings, and personal notes.

**Live:** [mitti-tax.github.io/MittsMods/games](https://mitti-tax.github.io/MittsMods/games)  
**API:** [mittsmods-production.up.railway.app](https://mittsmods-production.up.railway.app)

---

## Stack

| Layer    | Tech                                                |
| -------- | --------------------------------------------------- |
| Frontend | React + TypeScript (Vite), deployed to GitHub Pages |
| Backend  | C# ASP.NET Core 10 Web API, deployed to Railway     |
| Database | SQLite via Entity Framework Core                    |
| APIs     | Steam Web API, IGDB via Twitch OAuth                |
| CI/CD    | GitHub Actions — auto deploys on push to `main`     |

---

## Features

- **Steam sync** — imports full library, hours played, and achievements automatically
- **IGDB integration** — searches for game metadata, cover art, genres, and developers on add
- **Personal log** — track status (Backlog / Playing / Completed / Dropped / On Hold), hours, rating, notes, play mode (Handheld / TV / CRT), and hardware type (Original / Modded / Emulator / Cloud)
- **Dashboard** — recently played slideshow, stats bar (total games, hours, completed, playing now)
- **Edit mode** — bulk status changes directly on game cards without opening each one
- **Role-based access** — guests can browse freely, admin login required to add, edit, or delete
- **Responsive** — mobile-friendly with slide-in sidebar and bottom-sheet modals
- **27 platforms currently supported** — from NES to Xbox Series S/X, Dreamcast, PS Vita, Switch 2, and more

---

## Project Structure

```
games/
├── backend/
│   ├── Controllers/    # GamesController, PlatformsController, SearchController, SteamController, AuthController
│   ├── Data/           # EF Core DbContext, migrations
│   ├── DTOs/           # Request/response models
│   ├── Models/         # Game, Platform, UserEntry
│   ├── Services/       # IgdbService, SteamService
│   └── program.cs
└── frontend/
    └── src/
        ├── api/        # Centralised API client
        ├── components/ # LoginModal
        ├── hooks/      # useAuth
        └── pages/      # Dashboard, GamesPage
```

---

## Local Development

### Prerequisites

- .NET 10 SDK
- Node.js 18+

No database install needed — SQLite is a file, created automatically on first run.

### Backend

```bash
cd games/backend
dotnet restore
dotnet run
```

Migrations apply automatically on startup (`db.Database.Migrate()` in `program.cs`). To add a new migration after changing a model:

```bash
dotnet tool restore
dotnet tool run dotnet-ef migrations add YourMigrationName
```

Create `appsettings.Development.json` with:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=mittsmods.db"
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

| Service  | Platform     | Trigger                                       |
| -------- | ------------ | --------------------------------------------- |
| Frontend | GitHub Pages | Push to `main` (changes in `games/frontend/`) |
| Backend  | Railway      | Push to `main` (changes in `games/backend/`)  |

Railway environment variables required:

```
ASPNETCORE_ENVIRONMENT = Production
ASPNETCORE_URLS        = http://+:$PORT
ConnectionStrings__DefaultConnection = Data Source=/data/mittsmods.db
Twitch__ClientId
Twitch__ClientSecret
Steam__ApiKey
Steam__SteamId
ADMIN_PASSWORD
```

> **A Railway Volume must be attached and mounted at `/data`.** Railway's container filesystem is ephemeral and resets on every deploy — without a volume, the SQLite file (and everything in it) is wiped every time the service redeploys.

---

## Milestones

- [x] M1 — Project setup, EF Core schema, platform seed data
- [x] M2 — Core backend API (CRUD endpoints, DTOs)
- [x] M3 — IGDB integration (game search, cover art, metadata)
- [x] M4 — Steam integration (library sync, achievements)
- [x] M5 — React frontend (dashboard, game library, add/edit/delete)
- [x] M6 — Dashboard stats, recently played slideshow
- [x] M7 — PostgreSQL migration, Railway deployment, GitHub Actions CI/CD, auth, mobile UI
