# GameLog frontend

React + TypeScript + Vite app for [mittsmods.com/games](https://mittsmods.com/games). See [../Readme.md](../Readme.md) for the whole project.

```sh
npm install
npm run dev     # http://localhost:5173/games/, talks to VITE_API_URL (default http://localhost:5000)
npm test        # logic tests (Node's built-in runner)
npm run lint
npm run build   # type-checks, then builds to dist/
```

Point the dev server at another API with `VITE_API_URL=http://localhost:5055 npm run dev`.
Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`, which deploys the blog and this app together).
