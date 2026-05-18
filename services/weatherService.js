// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

import { getCache, setCache } from '../helpers/cache.js';
import { createHttpError } from '../helpers/apiResponse.js';

const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getWeather({ city = 'Denver' } = {}) {
  const cacheKey = `weather_${city}`;
  const cached = getCache(cacheKey);
  if (cached) return { data: cached, source: 'cached' };

  const { env } = await import('../config/env.js');
  const key = env.WEATHER_API_KEY;

  if (!key) {
    throw createHttpError('Weather is not configured. Add WEATHER_API_KEY to .env.', {
      statusCode: 503,
      code: 'WEATHER_NOT_CONFIGURED'
    });
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=imperial&appid=${key}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();

    if (!res.ok) {
      throw createHttpError('Weather service is unavailable right now.', {
        statusCode: res.status,
        code: 'WEATHER_API_ERROR',
        details: { status: res.status }
      });
    }

    if (
      typeof data?.main?.temp !== 'number' ||
      !Array.isArray(data.weather) ||
      !data.weather[0]?.main ||
      !data.weather[0]?.description ||
      !data.name
    ) {
      throw createHttpError('Weather service returned an unexpected response.', {
        code: 'WEATHER_INVALID_RESPONSE'
      });
    }

    setCache(cacheKey, data, WEATHER_CACHE_TTL);
    return { data, source: 'live' };
  } catch (error) {
    clearTimeout(timeoutId);
    // If API fails but we have cached data, return it as fallback
    if (cached) {
      return { data: cached, source: 'fallback' };
    }
    if (error.name === 'AbortError') {
      throw createHttpError('Weather service timed out.', {
        statusCode: 504,
        code: 'WEATHER_TIMEOUT'
      });
    }
    throw error;
  }
}
