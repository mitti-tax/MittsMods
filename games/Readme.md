# MittsMods — Games Database

A personal game tracking app with Steam integration. Full stack project: React (TypeScript) frontend, ASP.NET Core backend, SQLite database.

## Stack

| Layer    | Tech                             |
| -------- | -------------------------------- |
| Frontend | React + TypeScript (Vite)        |
| Backend  | C# ASP.NET Core 8 Web API        |
| Database | SQLite via Entity Framework Core |
| APIs     | Steam Web API, IGDB              |
| Hosting  | GitHub Pages (FE) + Railway (BE) |

## Project Structure

```
mittsmods-games/
├── backend/          # ASP.NET Core API
│   ├── Data/         # EF Core DbContext
│   ├── Models/       # Game, Platform, UserEntry
│   ├── Controllers/  # API endpoints (added in M2)
│   └── Program.cs
├── frontend/         # React + Vite (scaffolded in M1)
└── README.md
```

## Getting Started

### Backend

```bash
cd backend
dotnet restore
dotnet ef migrations add InitialCreate
dotnet ef database update
dotnet run
```

API runs at: `http://localhost:5000`
Swagger UI: `http://localhost:5000/swagger`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

## Milestones

- [x] M1 — Project Setup & Infrastructure
- [ ] M2 — Core Backend API
- [ ] M3 — IGDB Integration
- [ ] M4 — Steam Integration
- [ ] M5 — React Frontend
- [ ] M6 — Dashboard & Stats
- [ ] M7 — Polish & Deployment
