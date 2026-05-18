# Integration Routes And OpenAI Decision

This document maps the dashboard's integration routes and records the Phase 4 OpenAI route decision.

## Error Shape

Integration failures should use this safe shape:

```json
{
  "success": false,
  "data": null,
  "source": "error",
  "error": "Short user-safe message",
  "code": "MACHINE_READABLE_CODE",
  "details": {
    "status": 503
  },
  "timestamp": "2026-05-18T00:00:00.000Z"
}
```

`details` is optional and must not contain API keys, tokens, OpenAI prompts, Google raw responses, calendar summaries, task text, stack traces, or private family data.

## Route Audit

| Route | Service called | Env vars | Success shape | Error shape | Frontend use | Decision |
|---|---|---|---|---|---|---|
| `GET /api/health` | Local server only | None | `{ success, data: { uptime, environment, staticMode }, code: null, error, timestamp }` | Standard safe error if middleware catches one | Manual/smoke tests | Stay |
| `GET /api/weather` | OpenWeatherMap through `services/weatherService.js` | `WEATHER_API_KEY` | Standard envelope with OpenWeatherMap current weather in `data` | Standard safe error with codes like `WEATHER_NOT_CONFIGURED`, `WEATHER_API_ERROR`, `WEATHER_TIMEOUT` | Yes, Weather card | Stay and improve tests later |
| `GET /api/calendar` | Google Calendar through `services/calendarService.js` | `GOOGLE_CALENDAR_ID`, `GOOGLE_API_KEY` | Standard envelope with `{ date, items }` | Standard safe error with codes like `CALENDAR_NOT_CONFIGURED`, `CALENDAR_API_ERROR`, `CALENDAR_TIMEOUT` | Yes, Today card and summary context | Stay; consider OAuth later for private calendars |
| `GET /api/tasks` | Google Tasks plus local captures through `services/tasksService.js` | Google Tasks needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`; local captures need none | Standard envelope with `{ headers, tasks }` | Standard safe error with codes like `TASKS_NOT_CONFIGURED`, `TASKS_AUTH_FAILED`, `TASKS_API_ERROR`, `TASKS_TIMEOUT` | Yes, Tasks card and summary context | Stay |
| `GET /api/summary` | Weather, Calendar, Tasks, then OpenAI Chat Completions | `OPENAI_API_KEY`; other integrations are optional context | Standard envelope with `{ summary, usedAI, timestamp }` | Standard safe error, hides raw OpenAI errors | Yes, Daily Brief card | Stay; migrate with chat route later |
| `POST /api/capture` | Local JSON capture store | None | Standard envelope with saved capture item | Standard safe error with `CAPTURE_TEXT_REQUIRED` or `CAPTURE_TEXT_TOO_LONG` | Yes, Quick Capture page | Stay |
| `POST /api/chat` | OpenAI Chat Completions plus optional tool calls to weather/calendar/tasks | `OPENAI_API_KEY`; tool calls may need their integration env vars | Current success shape is `{ reply, usage }` for frontend compatibility | Safe error shape with codes like `OPENAI_NOT_CONFIGURED`, `PROMPT_REQUIRED`, `OPENAI_REQUEST_FAILED` | Yes, AI Assistant card | Canonical OpenAI route for now |
| `POST /assistant/run` | Legacy OpenAI Assistants/Threads path | `OPENAI_API_KEY`, `OPENAI_ASSISTANT_ID` | `{ reply }` | Safe error shape with assistant codes | No current frontend use | Keep temporarily, mark legacy, do not build new features on it |

## OpenAI Route Decision

Current UI route: `POST /api/chat`.

Canonical route going forward: `POST /api/chat`.

Legacy route: `POST /assistant/run`.

Keep `/assistant/run` temporarily because it may be useful for comparison or old experiments, but do not build new frontend behavior against it. It should be retired after the main chat path is migrated and tested.

## Future OpenAI Responses API Migration

Do not do the full migration in Phase 4. A future migration should:

- Create one OpenAI service module used by `/api/chat` and `/api/summary`.
- Replace raw Chat Completions calls with the OpenAI Responses API.
- Preserve the current frontend contract for `/api/chat` success: `{ reply, usage }`, or migrate the frontend in one small step.
- Recreate tool access for weather, calendar, and tasks server-side only.
- Remove or disable `/assistant/run` after the new path is stable.

## Failure Troubleshooting

Weather not loading:

- Check `WEATHER_API_KEY` in `.env`.
- Run `npm start` and visit `/api/weather`.
- Look for a safe `code` such as `WEATHER_NOT_CONFIGURED`.

Calendar not loading:

- Check `GOOGLE_CALENDAR_ID` and `GOOGLE_API_KEY`.
- Confirm the calendar is accessible with API key auth.
- Server logs should show only status/count information, not event text.

Tasks not loading:

- Check `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`.
- Confirm the refresh token was created with the Google Tasks read-only scope.

Daily Brief not loading:

- Check `OPENAI_API_KEY`.
- Check whether weather/calendar/tasks routes are returning useful context.

AI Assistant not loading:

- Use `/api/chat`, not `/assistant/run`.
- Check `OPENAI_API_KEY`.
- If the route returns `OPENAI_REQUEST_FAILED`, check server logs for non-secret status information.

## Privacy Rules

- Do not log Google refresh tokens, API keys, or Calendar IDs.
- Do not log raw calendar or task responses.
- Do not log OpenAI prompts or assistant messages unless deliberately debugging locally.
- Do not return stack traces to clients.
- Do not expose `.env` values to the frontend.
