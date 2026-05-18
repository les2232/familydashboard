import { getCache, setCache } from '../helpers/cache.js';
import { createHttpError } from '../helpers/apiResponse.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TASKS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function getAccessToken(env) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw createHttpError('Google Tasks is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to .env.', {
      statusCode: 503,
      code: 'TASKS_NOT_CONFIGURED'
    });
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw createHttpError('Google Tasks authorization failed.', {
      statusCode: res.status || 502,
      code: 'TASKS_AUTH_FAILED',
      details: { status: res.status }
    });
  }
  return data.access_token;
}

export async function getGoogleTasks() {
  const cacheKey = 'google_tasks';
  const cached = getCache(cacheKey);
  if (cached) return { data: cached, source: 'cached' };

  const { env } = await import('../config/env.js');
  const accessToken = await getAccessToken(env);

  const url = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&showHidden=false';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    clearTimeout(timeoutId);
    const data = await res.json();

    if (data.error) {
      throw createHttpError('Google Tasks service is unavailable right now.', {
        statusCode: res.status || 502,
        code: 'TASKS_API_ERROR',
        details: { status: res.status }
      });
    }

    const headers = ['status', 'description'];
    const tasks = (data.items || []).map(item => ({
      description: item.title || '',
      status: item.status === 'completed' ? 'Done' : 'Active',
    }));

    const result = { headers, tasks };
    setCache(cacheKey, result, TASKS_CACHE_TTL);
    return { data: result, source: 'live' };
  } catch (error) {
    clearTimeout(timeoutId);
    if (cached) return { data: cached, source: 'fallback' };
    if (error.name === 'AbortError') {
      throw createHttpError('Google Tasks service timed out.', {
        statusCode: 504,
        code: 'TASKS_TIMEOUT'
      });
    }
    throw error;
  }
}
