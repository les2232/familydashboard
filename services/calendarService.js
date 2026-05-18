import { DateTime } from 'luxon';
import { getCache, setCache } from '../helpers/cache.js';

// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const CALENDAR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCalendarEvents({ date } = {}) {
  const cacheKey = `calendar_${date || 'today'}`;
  const cached = getCache(cacheKey);
  if (cached) return { data: cached, source: 'cached' };

  const { env } = await import('../config/env.js');
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const apiKey = env.GOOGLE_API_KEY;
  const timeZone = 'America/Denver';

  if (!calendarId || !apiKey) {
    const error = new Error('Google Calendar is not configured. Add GOOGLE_CALENDAR_ID and GOOGLE_API_KEY to .env.');
    error.statusCode = 503;
    throw error;
  }

  // Use Luxon for all date handling
  const target = date
    ? DateTime.fromISO(date, { zone: timeZone })
    : DateTime.now().setZone(timeZone);

  const timeMin = target.startOf('day').toISO({ suppressMilliseconds: true, includeOffset: true });
  const timeMax = target.endOf('day').toISO({ suppressMilliseconds: true, includeOffset: true });

  const url = [
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    `?timeMin=${timeMin}`,
    `&timeMax=${timeMax}`,
    `&timeZone=${encodeURIComponent(timeZone)}`,
    `&singleEvents=true&orderBy=startTime`,
    `&key=${apiKey}`
  ].join('');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    console.log(`Calendar API response: status ${res.status}`);

    if (data.error) {
      console.error(`Calendar API returned an error: ${data.error.code || res.status}`);
      // If API error but cached data exists, return as fallback
      if (cached) {
        return { data: cached, source: 'fallback' };
      }
      const error = new Error(data.error.message || 'Google Calendar API error');
      error.statusCode = res.status;
      throw error;
    }
    if (!data.items?.length) {
      console.log('Calendar API success: 0 events returned.');
      return { data: { date: target.toISODate(), items: [] }, source: 'live' };
    }

    // Only include events whose start date matches the target date (local time)
    const targetDateStr = target.toISODate(); // 'YYYY-MM-DD'
    const items = data.items.filter(ev => {
      if (ev.start.dateTime) {
        const eventDate = DateTime.fromISO(ev.start.dateTime, { zone: timeZone });
        return eventDate.toISODate() === targetDateStr;
      } else if (ev.start.date) {
        return ev.start.date === targetDateStr;
      }
      return false;
    }).map(ev => ({
      start: ev.start,
      summary: ev.summary
    }));

    console.log(`Calendar API success: ${items.length} event(s) after local date filtering.`);
    const result = {
      date: targetDateStr,
      items
    };
    setCache(cacheKey, result, CALENDAR_CACHE_TTL);
    return { data: result, source: 'live' };
  } catch (error) {
    clearTimeout(timeoutId);
    // If API fails but cached data exists, return as fallback
    if (cached) {
      return { data: cached, source: 'fallback' };
    }
    if (error.name === 'AbortError') {
      throw new Error('Calendar API request timed out');
    }
    throw error;
  }
}
