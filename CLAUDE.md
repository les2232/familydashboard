# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Production server (Express on port 4000)
npm run dev      # Dev mode: Vite HMR on port 3000, proxies /api/* to port 4000
npm run build    # Vite production build → dist/ (strips console/debugger)
npm run preview  # Preview production build
```

There are no tests. There is no linter configured.

## Architecture

**Dual-process in dev**: Vite serves the frontend (port 3000, falls back to 3001 if taken) and Express serves the API (port 4000). In production, Express serves the static frontend directly from the project root.

**Entry point**: `server.mjs` — all ESM (`"type": "module"` in package.json).

### API layer

All routes are mounted at `/api` in `server.mjs`:

| Route file | Endpoint | Description |
|---|---|---|
| `routes/weather.js` | `GET /api/weather[?city=...]` | OpenWeatherMap, defaults to Aurora,CO,US |
| `routes/calendar.js` | `GET /api/calendar[?date=YYYY-MM-DD]` | Google Calendar, defaults to today |
| `routes/tasks.js` | `GET /api/tasks` | Google Tasks (default task list, active only) |
| `routes/summary.js` | `GET /api/summary` | OpenAI-generated daily briefing from live data |

Two additional endpoints defined inline in `server.mjs`:
- `POST /api/chat` — OpenAI chat completions with tool-calling (weather, calendar, tasks). **This is what the AI Assistant card uses.**
- `POST /assistant/run` — OpenAI Assistants API (requires `OPENAI_ASSISTANT_ID`). Not used by the frontend.

All route handlers return a consistent envelope: `{ success, data, source, error, timestamp }`.  
The `source` field is always one of `'live'`, `'cached'`, `'fallback'`, or `'error'`.

### Services

| File | Responsibility |
|---|---|
| `services/weatherService.js` | OpenWeatherMap API, 10 min cache |
| `services/calendarService.js` | Google Calendar API (API key auth), 5 min cache. Uses **luxon**, hardcodes `America/Denver`. Does not cache empty results. |
| `services/googleTasksService.js` | Google Tasks API (OAuth 2.0). Refreshes access token via refresh token on every cold call. 3 min cache. Returns `{ headers: ['status', 'description'], tasks: [{status, description}] }`. |
| `routes/summary.js` | Fetches weather + calendar + tasks in parallel, builds a prompt, calls `gpt-4o-mini`, 10 min cache. |

### Helpers and config

- **`helpers/cache.js`** — `Map`-based in-memory TTL cache. Exports `getCache`, `setCache`, `clearCache`. Entries expire on read.
- **`helpers/utils.js`** — `interpolateTemplates()` replaces `{{variable}}` placeholders (used to inject `current_date` into AI responses).
- **`config/env.js`** — Single source of truth for all env vars. No side effects (Notion client removed).

### Frontend

Single-page vanilla JS app: `index.html` + `script.js` (ES module) + `style.css` + `critical.css`.

- `critical.css` loads synchronously (above-the-fold styles, grid layout, card shells).
- `style.css` loads async via preload trick. Contains animations — all `.card` elements start at `opacity: 0` and fade in via `fadeInUp`. Tasks card has `animation-delay: 0.4s`.
- Widget state (loading/error/stale) is managed in a `widgetStates` object keyed by `weather`, `calendar`, `tasks`.
- Each widget auto-refreshes: weather 10 min, calendar 5 min, tasks 3 min.
- Daily Brief has its own `briefState` object and refreshes every 10 min.
- Focus Mode is toggled via the header button and persisted in `localStorage`. It hides `.focus-hide` elements and reorders cards. The AI Assistant card does **not** have `focus-hide` — it's always visible.

#### Widget data shape (important — frontend reads `data.data`, not `data` directly)

The API envelope is `{ success, data, source, ... }`. The frontend unpacks `data.data` for all widget content:
- Weather: `data.data.main.temp`, `data.data.name`, `data.data.weather[0]`
- Calendar: `data.data.items[]` — each item has `{ start: { dateTime }, summary }`
- Tasks: `data.data.tasks[]` + `data.data.headers[]`
- Summary: `data.data.summary`, `data.data.usedAI`

## Google Tasks OAuth setup

Tasks uses OAuth 2.0 with a refresh token (API key auth is not supported for Tasks).

**Required env vars:**
```
GOOGLE_CLIENT_ID       # From Google Cloud Console → OAuth 2.0 client (Web application type)
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN   # Obtained via OAuth Playground (see below)
```

**To regenerate a refresh token:**
1. Go to [OAuth Playground](https://developers.google.com/oauthplayground)
2. Click the gear icon → check **"Use your own OAuth credentials"**
3. Enter your Client ID and Secret
4. Scope: `https://www.googleapis.com/auth/tasks.readonly`
5. Authorize → Exchange code for tokens → copy **Refresh token**

**Requirements in Google Cloud Console:**
- OAuth client type: **Web application** (not Desktop)
- Authorized redirect URI: `https://developers.google.com/oauthplayground`
- OAuth consent screen: add `lescordova22@gmail.com` as a test user
- Tasks API must be enabled in the project

## Environment variables

Required in `.env`:

```
WEATHER_API_KEY
GOOGLE_CALENDAR_ID
GOOGLE_API_KEY             # For Calendar (public calendar, API key is sufficient)
GOOGLE_CLIENT_ID           # For Tasks OAuth
GOOGLE_CLIENT_SECRET       # For Tasks OAuth
GOOGLE_REFRESH_TOKEN       # For Tasks OAuth
OPENAI_API_KEY
OPENAI_ASSISTANT_ID        # Optional, only for /assistant/run
```

## Planned features

### Discord notes feed
- Fetch messages from a designated Discord channel and display them as a notes/feed widget on the dashboard.
- Likely approach: Discord bot token + channel ID, polling the Discord REST API (`GET /channels/{id}/messages`).
- New env vars needed: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`.
- New files: `services/discordService.js`, `routes/discord.js`.
- Frontend: new widget card in `index.html`, rendering logic in `script.js`.

## Known issues (none currently)

Previously fixed this session:
- `notionService.js` referenced `cache` directly instead of using `getCache` — caused 500 on every tasks request. Fixed and replaced with Google Tasks.
- Calendar service was caching empty results — new events wouldn't appear until cache expired. Fixed by not caching empty responses.
- All widget renderers were reading `data.X` instead of `data.data.X` (API envelope mismatch).
- `loadBrief` in `script.js` was calling `setWidgetState` after writing to `.brief-text`, which wiped the content. Fixed order.
- AI Assistant card had `focus-hide` class applied unconditionally, hiding it permanently.
- Stray `}` in `style.css` after the 768px media query. Removed.
