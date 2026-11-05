# MittsMods - Games Database

A personal game tracking and logging application. Tracks every game played across my personal Steam Library, and includes sync, IGDB metadata, achievements, ratings, and personal notes.

**Live:** [mittsmods.com/games](https://mittsmods.com/games/)  
**API:** [api.mittsmods.com](https://api.mittsmods.com/api/platforms)

---

## Stack

| Layer    | Tech                                                |
| -------- | --------------------------------------------------- |
| Frontend | React + TypeScript (Vite), deployed to GitHub Pages |
| Backend  | C# ASP.NET Core 10 Web API, self-hosted with Docker |
| Database | PostgreSQL via Entity Framework Core                |
| APIs     | Steam Web API, IGDB via Twitch OAuth                |
| Hosting  | Docker Compose behind a Cloudflare Tunnel           |
| CI/CD    | GitHub Actions deploys the frontend on push         |

---

## Features

- **Steam sync** — imports full library, hours played, and achievements automatically
- **IGDB integration** — searches for game metadata, cover art, genres, and developers on add
- **Personal log** — track status (Backlog / Playing / Completed / Dropped / On Hold), hours, rating, notes, play mode (Handheld / TV / CRT), and hardware type (Original / Modded / Emulator / Cloud)
- **Dashboard** — recently played slideshow, stats bar (total games, hours, completed, playing now)
- **Edit mode** — bulk status changes directly on game cards without opening each one
- **Role-based access** — guests can browse freely; the API rejects any add, edit, or delete without a signed admin token
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

| Service  | Where                                  | How                                                        |
| -------- | -------------------------------------- | ---------------------------------------------------------- |
| Frontend | GitHub Pages (`mittsmods.com/games`)   | GitHub Actions on push to `main` (changes in `games/frontend/`) |
| Backend  | Self-hosted server, Docker Compose     | `git pull && docker compose up -d --build`                 |
| Database | PostgreSQL container on the same host  | Only reachable inside the Docker network                   |

The API is published through a Cloudflare Tunnel, so the server has no open inbound ports. The frontend's API URL lives in `frontend/.env.production`.

### Running the backend

```bash
cd games
cp .env.example .env                    # fill in, then chmod 600 .env
docker compose up -d --build db api
ADMIN_PASSWORD='...' ./check-auth.sh    # smoke-tests reads, rejected writes, and login
docker compose up -d                    # also starts cloudflared once TUNNEL_TOKEN is set
```

Required variables are listed in `.env.example`.

---

## Milestones

- [x] M1 — Project setup, EF Core schema, platform seed data
- [x] M2 — Core backend API (CRUD endpoints, DTOs)
- [x] M3 — IGDB integration (game search, cover art, metadata)
- [x] M4 — Steam integration (library sync, achievements)
- [x] M5 — React frontend (dashboard, game library, add/edit/delete)
- [x] M6 — Dashboard stats, recently played slideshow
- [x] M7 — PostgreSQL migration, Railway deployment, GitHub Actions CI/CD, auth, mobile UI
- [x] M8 — Moved the API from Railway to a self-hosted Docker stack behind Cloudflare Tunnel, signed admin tokens on all writes, custom domain
