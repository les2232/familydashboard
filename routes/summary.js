import express from 'express';
import { getWeather } from '../services/weatherService.js';
import { getCalendarEvents } from '../services/calendarService.js';
import { getTasks } from '../services/tasksService.js';
import { getCache, setCache } from '../helpers/cache.js';
import { createHttpError, sendError, sendSuccess } from '../helpers/apiResponse.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const SUMMARY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const router = express.Router();

router.get('/summary', async (req, res) => {
  const cacheKey = 'daily_summary';
  const cached = getCache(cacheKey);
  if (cached) {
    return sendSuccess(res, { data: cached, source: 'cached' });
  }

  try {
    const { env } = await import('../config/env.js');
    if (!env.OPENAI_API_KEY) {
      throw createHttpError('Daily Brief is not configured. Add OPENAI_API_KEY to .env.', {
        statusCode: 503,
        code: 'OPENAI_NOT_CONFIGURED'
      });
    }

    // Fetch all data sources in parallel
    const [weatherResult, calendarResult, tasksResult] = await Promise.allSettled([
      getWeather({ city: 'Aurora,CO,US' }),
      getCalendarEvents({}),
      getTasks()
    ]);

    // Build context strings
    let weatherContext = 'Weather unavailable.';
    if (weatherResult.status === 'fulfilled') {
      const w = weatherResult.value.data;
      weatherContext = `${Math.round(w.main.temp)}°F, ${w.weather[0].description} in ${w.name}.`;
    }

    let calendarContext = 'No events today.';
    if (calendarResult.status === 'fulfilled') {
      const items = calendarResult.value.data?.items || [];
      if (items.length > 0) {
        calendarContext = items.map(ev => {
          const time = ev.start.dateTime
            ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
            : 'All day';
          return `${time}: ${ev.summary}`;
        }).join(', ');
      }
    }

    let tasksContext = 'No tasks.';
    if (tasksResult.status === 'fulfilled') {
      const tasks = tasksResult.value.data?.tasks || [];
      const active = tasks.filter(t => t.status !== 'Done');
      if (active.length > 0) {
        tasksContext = active.map(t => t.description).join(', ');
      }
    }

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' });

    const prompt = `You are a concise personal assistant. Write a short daily briefing (2-3 sentences max) for ${today}.

Weather: ${weatherContext}
Calendar: ${calendarContext}
Tasks: ${tasksContext}

Be warm and practical. Don't use bullet points.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.7
      })
    });

    const aiData = await response.json();
    if (!response.ok) {
      console.error('OpenAI summary request failed:', aiData.error?.message || response.status);
      throw createHttpError('Daily Brief service is unavailable right now.', {
        statusCode: response.status,
        code: 'OPENAI_SUMMARY_FAILED',
        details: { status: response.status }
      });
    }

    const summary = aiData.choices[0].message.content.trim();
    const result = { summary, usedAI: true, timestamp: new Date().toISOString() };
    setCache(cacheKey, result, SUMMARY_CACHE_TTL);

    sendSuccess(res, { data: result, source: 'live' });
  } catch (error) {
    console.error('Summary route error:', error);
    sendError(res, error, 'Failed to generate daily brief');
  }
});

export default router;
