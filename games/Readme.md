# MittsMods — Games Database

A personal game tracking and logging application. Tracks every game played across my personal Steam Library, and includes sync, IGDB metadata, achievements, ratings, and personal notes.

**Live:** [mitti-tax.github.io/MittsMods/games](https://mitti-tax.github.io/MittsMods/games)
**API:** [mittsmods-production.up.railway.app](https://mittsmods-production.up.railway.app)

---

## Stack

| Layer    | Tech                                                |
| -------- | --------------------------------------------------- |
| Frontend | React + TypeScript (Vite), deployed to GitHub Pages |
| Backend  | C# ASP.NET Core 10 Web API, deployed to Railway     |
| Database | PostgreSQL via Entity Framework Core                |
| APIs     | Steam Web API, IGDB via Twitch OAuth                |
| CI/CD    | GitHub Actions — auto deploys on push to `main`     |

---

## Features

- **Steam sync** — imports the library, hours played, and achievements. Large libraries import in batches; the response says how many are left.
- **IGDB integration** — searches for game metadata, cover art, genres, and developers on add
- **Personal log** — status (Backlog / Playing / Completed / Dropped / On Hold), hours, rating, notes, play mode (Handheld / TV / CRT), hardware type (Original / Modded / Emulator / Cloud), and start/finish dates
- **Multiple platforms per game** — log the same game on a console and on PC, each with its own entry
- **Favourites** — flag a game and filter the library down to them
- **Search, filter and sort** — by title or developer, status, platform, and seven sort orders, all resolved in the database
- **Dashboard** — recently played slideshow, library totals, top platforms
- **Edit mode** — bulk status changes directly on game cards
- **CSV export** — one row per log entry, respecting the current filters
- **Linkable views** — the URL carries the filters and the open game, so the back button works and views can be shared
- **Role-based access** — guests browse; admin login is required to add, edit, or delete, enforced by the API and not just by the UI
- **Responsive and accessible** — slide-in sidebar, bottom-sheet dialogs, keyboard navigation, focus management, and `prefers-reduced-motion` support
- **27 platforms supported** — from NES to Xbox Series S/X, Dreamcast, PS Vita, Switch 2, and more

---

## API

All write endpoints, plus the IGDB search, require `Authorization: Bearer <token>`.

| Method   | Route                                     | Auth  | Notes                                          |
| -------- | ----------------------------------------- | ----- | ---------------------------------------------- |
| `GET`    | `/api/games`                              | —     | Paged; `q`, `status`, `platformId`, `favourite`, `minHours`, `sort`, `page`, `pageSize` |
| `GET`    | `/api/games/stats`                        | —     | Library totals, aggregated in SQL              |
| `GET`    | `/api/games/{id}`                         | —     | Full record including the IGDB summary         |
| `POST`   | `/api/games`                              | admin | `409` with the existing `gameId` on a duplicate |
| `POST`   | `/api/games/{id}/entries`                 | admin | Log the game on another platform               |
| `PUT`    | `/api/games/{id}/entries/{entryId}`       | admin | Full replace — sending `null` clears a field   |
| `DELETE` | `/api/games/{id}/entries/{entryId}`       | admin | Refuses to remove the only entry               |
| `PATCH`  | `/api/games/{id}/favourite`               | admin |                                                |
| `DELETE` | `/api/games/{id}`                         | admin |                                                |
| `GET`    | `/api/platforms`                          | —     | Cached for an hour                             |
| `GET`    | `/api/search?q=`                          | admin | IGDB lookup — spends a shared quota            |
| `GET`    | `/api/steam/library`                      | admin | Preview without importing                      |
| `POST`   | `/api/steam/sync`                         | admin | One run at a time; `409` if already running    |
| `POST`   | `/api/auth/login`                         | —     | Rate limited to 10 attempts per 5 minutes      |
| `POST`   | `/api/auth/verify`                        | —     | Token in the header or the body                |
| `GET`    | `/health`                                 | —     | Includes a database reachability probe         |

List responses omit the IGDB `summary` — fetch `/api/games/{id}` for it.

### Authentication

`POST /api/auth/login` exchanges the admin password for an HMAC-SHA256 signed
token that carries an expiry and a random nonce. Set `TOKEN_SIGNING_KEY` to
control the key directly; without it the key is derived from the admin password
with PBKDF2, which means changing the password invalidates existing sessions.

---

## Project Structure

```
games/
├── backend/
│   ├── Controllers/    # Games, Platforms, Search, Steam, Auth
│   ├── Data/           # EF Core DbContext
│   ├── DTOs/           # Request/response models with validation
│   ├── Migrations/
│   ├── Models/         # Game, Platform, UserEntry
│   ├── Security/       # Admin token issuing/validation, [AdminOnly], rate limit policies
│   ├── Services/       # IgdbService, SteamService
│   ├── Validation/     # EnumName attribute
│   └── program.cs
└── frontend/
    └── src/
        ├── api/        # Client and token storage
        ├── components/ # Dialogs, cards, forms
        ├── hooks/      # Auth, hash routing, toasts
        ├── lib/        # Formatting, entry payloads, CSV export
        └── pages/      # Dashboard, GamesPage
```

---

## Local Development

### Prerequisites

- .NET 10 SDK
- Node.js 20+
- PostgreSQL (local instance)

### Backend

```bash
cd games/backend
dotnet restore
dotnet ef database update
dotnet run
```

Create `appsettings.Development.json` (git-ignored) with:

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
  "AdminAuth": {
    "Password": "your_admin_password"
  }
}
```

Without `AdminAuth:Password` (or `ADMIN_PASSWORD`) the API starts read-only and
logs a warning — the write endpoints answer `503`.

API runs at: `http://localhost:5000`

### Frontend

```bash
cd games/frontend
npm ci
npm run dev
```

Frontend runs at `http://localhost:5173`, proxying `/api` to the backend. Leave
`VITE_API_URL` unset locally so requests stay same-origin and skip CORS.

```bash
npm run lint    # eslint
npm run build   # typecheck + production build
```

---

## Deployment

| Service  | Platform     | Trigger                                       |
| -------- | ------------ | --------------------------------------------- |
| Frontend | GitHub Pages | Push to `main` (changes in `games/frontend/`) |
| Backend  | Railway      | Push to `main` (changes in `games/backend/`)  |

CI (`.github/workflows/ci.yml`) builds the API and lints and builds the frontend
on every branch and pull request.

Railway environment variables:

```
DATABASE_URL           (injected automatically from Railway Postgres)
ASPNETCORE_ENVIRONMENT = Production
ASPNETCORE_URLS        = http://+:$PORT
Twitch__ClientId
Twitch__ClientSecret
Steam__ApiKey
Steam__SteamId
ADMIN_PASSWORD
```

Optional:

```
TOKEN_SIGNING_KEY                # keeps sessions alive across password changes
Cors__AllowedOrigins__0          # overrides the allowed browser origins
AdminAuth__TokenLifetimeHours    # default 12
DATABASE_SSL_MODE                # default Require; use VerifyFull for a CA-issued certificate
```

The API sits behind Railway's proxy and reads `X-Forwarded-For` /
`X-Forwarded-Proto`, so rate limits partition on the real client IP.

---

## Milestones

- [x] M1 — Project setup, EF Core schema, platform seed data
- [x] M2 — Core backend API (CRUD endpoints, DTOs)
- [x] M3 — IGDB integration (game search, cover art, metadata)
- [x] M4 — Steam integration (library sync, achievements)
- [x] M5 — React frontend (dashboard, game library, add/edit/delete)
- [x] M6 — Dashboard stats, recently played slideshow
- [x] M7 — PostgreSQL migration, Railway deployment, GitHub Actions CI/CD, auth, mobile UI
- [x] M8 — Enforced admin auth and signed tokens, server-side search/filter/sort/paging, favourites and multi-platform entries in the UI, accessibility pass, CSV export
