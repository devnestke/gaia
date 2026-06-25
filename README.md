# GAIA

**Crowd-curated music for live events.**

GAIA turns a room into the DJ. Guests search for tracks, vote on what plays next, and a server-driven auto-DJ advances the queue based on the crowd's real-time ranking — no login, no app install, just a shared link.

## How it works

- **Guests** open the event link, search the [Deezer](https://developers.deezer.com/api) catalogue (keyless — no credentials needed), and add or upvote tracks.
- **Host** opens the host view, which plays the top-ranked track and auto-advances when each finishes.
- **Realtime** ranking updates stream to every connected device over Socket.IO.

> Playback uses Deezer's 30-second preview clips. Preview URLs are signed and expire after a few hours; GAIA always fetches a fresh URL before playing.

## Tech

- **Frontend** — React + Vite + Tailwind (`frontend/`)
- **Server** — Express + Socket.IO + SQLite via Knex/Kysely (`server/`)
- **Music** — Deezer public API (no API key)

## Local development

```bash
npm run setup     # install all deps + run migrations
npm run dev       # server on :3001, web on :5173
```

Open <http://localhost:5173>.

## Configuration

Copy `.env.dist` to `server/.env` and adjust as needed. The defaults work out of the box for local use — the Deezer source requires no keys.

## License & attribution

MIT — see [LICENSE.txt](LICENSE.txt).

GAIA began as a fork of [skeptrunedev/jukebox](https://github.com/skeptrunedev/jukebox) (MIT, © Skeptrune) and was reworked around a keyless Deezer music source and a crowd-relevance ranking engine. The original copyright notice is retained per the MIT license.
