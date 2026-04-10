# MittsMods — Games Database

A personal game tracking and logging application. Tracks every game played across my personal Steam Library, and includes sync, IGDB metadata, achievements, ratings, and personal notes.

**Live:** [mitti-tax.github.io/MittsMods/games](https://mitti-tax.github.io/MittsMods/games)  
**API:** [mittsmods-production.up.railway.app](https://mittsmods-production.up.railway.app)

---

## Stack

| Layer    | Tech                                                  |
|----------|-------------------------------------------------------|
| Frontend | React + TypeScript (Vite), deployed to GitHub Pages   |
| Backend  | C# ASP.NET Core 10 Web API, deployed to Railway       |
| Database | PostgreSQL via Entity Framework Core                  |
| APIs     | Steam Web API, IGDB via Twitch OAuth                  |
| CI/CD    | GitHub Actions — auto deploys on push to `main`       |

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
- PostgreSQL (local instance)

### Backend

```bash
cd games/backend
dotnet restore
dotnet ef migrations add InitialCreate
dotnet ef database update
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

| Service | Platform | Trigger |
|---------|----------|---------|
| Frontend | GitHub Pages | Push to `main` (changes in `games/frontend/`) |
| Backend | Railway | Push to `main` (changes in `games/backend/`) |

Railway environment variables required:
```
DATABASE_URL        (injected automatically from Railway Postgres)
ASPNETCORE_ENVIRONMENT = Production
ASPNETCORE_URLS        = http://+:$PORT
Twitch__ClientId
Twitch__ClientSecret
Steam__ApiKey
Steam__SteamId
ADMIN_PASSWORD
```

---

## Milestones

- [x] M1 — Project setup, EF Core schema, platform seed data
- [x] M2 — Core backend API (CRUD endpoints, DTOs)
- [x] M3 — IGDB integration (game search, cover art, metadata)
- [x] M4 — Steam integration (library sync, achievements)
- [x] M5 — React frontend (dashboard, game library, add/edit/delete)
- [x] M6 — Dashboard stats, recently played slideshow
- [x] M7 — PostgreSQL migration, Railway deployment, GitHub Actions CI/CD, auth, mobile UI
