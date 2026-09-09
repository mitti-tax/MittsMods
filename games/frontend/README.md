# GameLog frontend

The React + TypeScript (Vite) client for the games database. See
[`../Readme.md`](../Readme.md) for the API, the environment variables, and how
the two halves fit together.

## Commands

```bash
npm ci        # install exactly what the lockfile pins
npm run dev   # dev server on :5173, proxying /api to localhost:5000
npm run lint  # eslint
npm run build # typecheck (tsc -b) then production build
```

## Layout

| Path          | What lives there                                              |
| ------------- | ------------------------------------------------------------- |
| `src/api`     | The API client and the admin token, kept in separate modules so a 401 anywhere can drop the session |
| `src/hooks`   | Auth state, hash routing, the toast context                    |
| `src/lib`     | Status formatting, entry payload building, CSV export          |
| `src/components` | Dialogs, cards, and the shared entry form                   |
| `src/pages`   | Dashboard and library                                          |

## Conventions

- `VITE_API_URL` is unset in development, so requests are relative and go
  through the Vite proxy. `.env.production` points at Railway.
- Filters live in the URL hash, not in component state — the back button and
  shared links depend on it.
- Dialogs go through `components/Modal`, which handles labelling, Escape,
  the focus trap, focus restore, and the scroll lock.
- Anything the user can act on is a real `<button>` or form control.
