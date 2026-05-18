import { getCache, setCache } from '../helpers/cache.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TASKS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function getAccessToken(env) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    const error = new Error('Google Tasks is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to .env.');
    error.statusCode = 503;
    throw error;
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
    throw new Error(`Token refresh failed: ${data.error_description || data.error || 'unknown'}`);
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
      throw new Error(data.error.message || 'Google Tasks API error');
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
    if (error.name === 'AbortError') throw new Error('Google Tasks API request timed out');
    throw error;
  }
}
