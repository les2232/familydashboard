import test from 'node:test';
import assert from 'node:assert/strict';
import { env, getIntegrationStatus } from '../config/env.js';
import { createCapture, MAX_CAPTURE_TEXT_LENGTH, normalizeCaptureInput } from '../services/captureService.js';
import { getWeather } from '../services/weatherService.js';

test('normalizeCaptureInput trims text and normalizes unknown options', () => {
  const input = normalizeCaptureInput({
    text: '  call   dentist  ',
    type: 'unknown',
    dueLabel: 'next week',
    priority: false
  });

  assert.deepEqual(input, {
    text: 'call dentist',
    type: 'task',
    dueLabel: null,
    priority: null
  });
});

test('createCapture rejects empty text without writing data', async () => {
  await assert.rejects(
    () => createCapture({ text: '   ' }),
    error => error.statusCode === 400 && error.code === 'CAPTURE_TEXT_REQUIRED'
  );
});

test('createCapture rejects text over the max length without writing data', async () => {
  await assert.rejects(
    () => createCapture({ text: 'x'.repeat(MAX_CAPTURE_TEXT_LENGTH + 1) }),
    error => (
      error.statusCode === 400 &&
      error.code === 'CAPTURE_TEXT_TOO_LONG' &&
      error.details.maxLength === MAX_CAPTURE_TEXT_LENGTH
    )
  );
});

test('weather service rejects missing API key before any network call', async () => {
  const originalKey = env.WEATHER_API_KEY;
  env.WEATHER_API_KEY = '';

  try {
    await assert.rejects(
      () => getWeather({ city: 'Denver' }),
      error => error.statusCode === 503 && error.code === 'WEATHER_NOT_CONFIGURED'
    );
  } finally {
    env.WEATHER_API_KEY = originalKey;
  }
});

test('integration status reports configured and missing integrations without secrets', () => {
  const status = getIntegrationStatus();

  assert.equal(typeof status.weather.configured, 'boolean');
  assert.ok(Array.isArray(status.weather.missing));
  assert.ok(Object.hasOwn(status, 'openaiChat'));
  assert.ok(!JSON.stringify(status).includes(env.OPENAI_API_KEY || 'not-a-real-key'));
});
