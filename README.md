# Family Dashboard

A local personal/family dashboard for a Raspberry Pi or always-on display. It shows a simple today-at-a-glance view with weather, calendar events, tasks, a daily brief, quick capture, and an AI assistant panel.

This project is intentionally small: vanilla frontend files plus a Node/Express backend.

## Integrations

- OpenWeatherMap for weather
- Google Calendar for today's events
- Google Tasks for active tasks
- OpenAI for the AI Assistant and Daily Brief
- Local JSON storage for Quick Capture items

All integrations are optional at startup. If one is missing from `.env`, the server still starts and that route returns a helpful error.

## Required Software

- Node.js 18 or newer
- npm
- A terminal

## Install

```bash
npm install
```

## Environment Setup

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then fill in the integrations you want to use. Never commit `.env`; it contains private API keys and tokens.

## How The App Runs

There are two ways to run it.

Development mode runs two local servers:

- Express backend: `http://localhost:4000`
- Vite frontend: `http://localhost:3000`

Local production-style mode runs one server:

- Express serves the Vite `dist/` build at `http://localhost:4000` when it exists
- If `dist/` does not exist yet, Express falls back to the project root so local running still works
- API routes are also served from the same Express app

This is the recommended path for Raspberry Pi deployment: run `npm run build`, then run `npm start`.

## npm Scripts

```bash
npm run dev:server   # backend only, Express on port 4000
npm run dev:client   # frontend only, Vite on port 3000
npm run dev          # starts backend and frontend together
npm start            # local production-style app on port 4000
npm run build        # builds static frontend files into dist/
npm run preview      # previews the Vite build
npm run check        # lightweight local smoke check, no real API keys required
```

## Run In Development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Vite proxies `/api/*` requests to the Express backend on port `4000`.

## Run Local Production-Style

```bash
npm start
```

Open:

```text
http://localhost:4000
```

`npm start` runs the Express app on port `4000`. It serves the Vite build from `dist/` if you have run `npm run build`; otherwise it falls back to the root HTML/CSS/JS files. For Raspberry Pi use, run a build first.

## Smoke Tests

Run the local check:

```bash
npm run check
```

Build the frontend:

```bash
npm run build
```

Start the server:

```bash
npm start
```

Then visit:

```text
http://localhost:4000/api/health
```

You should see JSON with `"success": true`.

## Raspberry Pi / LAN Origins

By default, browser requests are allowed only from:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:4000`
- `http://127.0.0.1:4000`

If you need to open the dashboard from another device on your home network, add allowed origins to `.env`:

```env
DASHBOARD_ALLOWED_ORIGINS=http://192.168.1.50:4000
```

For more than one origin, separate them with commas:

```env
DASHBOARD_ALLOWED_ORIGINS=http://192.168.1.50:4000,http://family-dashboard.local:4000
```

Only add origins you trust.

## Raspberry Pi Deployment

The beginner-friendly deployment guide is here:

```text
docs/raspberry-pi-deployment.md
```

Recommended deployment choice: `systemd`.

Why:

- It is already built into Raspberry Pi OS.
- It can restart the dashboard after a crash.
- It starts the app again after reboot.
- It avoids adding PM2 or another process manager for one local app.

PM2 is still a reasonable option if you already like Node-specific process tools, but `systemd` is the cleaner default for this project.

A sample service file is included:

```text
docs/family-dashboard.service.example
```

Future kiosk mode should be added in small steps: first make the Node service reliable, then launch Chromium in kiosk mode, then disable screen blanking.

## API Routes

See the full integration route audit and OpenAI route decision:

```text
docs/integrations.md
```

- `GET /api/health`
- `GET /api/weather`
- `GET /api/calendar`
- `GET /api/tasks`
- `GET /api/summary`
- `POST /api/capture`
- `POST /api/chat`
- `POST /assistant/run` legacy assistant route, not used by the current frontend

API responses use this general shape:

```json
{
  "success": true,
  "data": {},
  "source": "live",
  "error": null,
  "timestamp": "2026-05-18T00:00:00.000Z"
}
```

Integration failures also include a machine-readable `code`, and may include safe `details` such as an upstream HTTP status. They must not include secrets, stack traces, raw Google responses, private event/task text, or OpenAI prompts.

## Known Remaining Issues

These are intentionally not done yet:

- Migrate OpenAI code to the newer Responses API
- Decide whether to remove or disable `/assistant/run`
- Install or enable the Raspberry Pi systemd service automatically
- Add Chromium kiosk autostart scripts
- Broader frontend cleanup beyond the highest-risk rendering spots
- Decide between real authentication, local-only access, or LAN-only access
- Clean up the project folder structure
- Decide whether to remove the root-file fallback after the `dist/` flow is proven
