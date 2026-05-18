import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.mjs';
import { MAX_CAPTURE_TEXT_LENGTH } from '../services/captureService.js';

async function withTestServer(callback) {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

test('GET /api/health returns success without external API calls', async () => {
  await withTestServer(async baseUrl => {
    const { response, body } = await requestJson(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.error, null);
    assert.equal(body.code, null);
    assert.equal(typeof body.data.uptime, 'number');
  });
});

test('POST /api/chat rejects empty prompts with normalized error shape', async () => {
  await withTestServer(async baseUrl => {
    const { response, body } = await requestJson(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Prompt is required');
    assert.equal(body.code, 'PROMPT_REQUIRED');
    assert.equal(body.source, 'error');
  });
});

test('POST /api/capture rejects empty text with normalized error shape', async () => {
  await withTestServer(async baseUrl => {
    const { response, body } = await requestJson(`${baseUrl}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' })
    });

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.code, 'CAPTURE_TEXT_REQUIRED');
    assert.equal(body.source, 'error');
  });
});

test('POST /api/capture rejects overly long text with safe details', async () => {
  await withTestServer(async baseUrl => {
    const { response, body } = await requestJson(`${baseUrl}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(MAX_CAPTURE_TEXT_LENGTH + 1) })
    });

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.code, 'CAPTURE_TEXT_TOO_LONG');
    assert.deepEqual(body.details, { maxLength: MAX_CAPTURE_TEXT_LENGTH });
  });
});
