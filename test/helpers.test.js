import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCache, getCache, setCache } from '../helpers/cache.js';
import { createHttpError, sendError, sendSuccess } from '../helpers/apiResponse.js';

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('sendSuccess returns the standard success envelope', () => {
  const res = createMockResponse();

  sendSuccess(res, { data: { ok: true }, source: 'test' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { ok: true });
  assert.equal(res.body.source, 'test');
  assert.equal(res.body.error, null);
  assert.equal(typeof res.body.timestamp, 'string');
});

test('sendError returns a safe coded error envelope', () => {
  const res = createMockResponse();
  const error = createHttpError('Missing config', {
    statusCode: 503,
    code: 'TEST_NOT_CONFIGURED',
    details: { integration: 'test' }
  });

  sendError(res, error, 'Fallback message');

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.source, 'error');
  assert.equal(res.body.error, 'Missing config');
  assert.equal(res.body.code, 'TEST_NOT_CONFIGURED');
  assert.deepEqual(res.body.details, { integration: 'test' });
});

test('sendError hides unexpected internal messages behind fallback text', () => {
  const res = createMockResponse();

  sendError(res, new Error('private internal detail'), 'Safe fallback');

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Safe fallback');
  assert.equal(res.body.code, 'REQUEST_FAILED');
});

test('cache helper stores, expires, and clears values', async () => {
  setCache('phase5-cache', { value: 1 }, 20);
  assert.deepEqual(getCache('phase5-cache'), { value: 1 });

  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(getCache('phase5-cache'), null);

  setCache('phase5-cache', { value: 2 }, 1000);
  clearCache('phase5-cache');
  assert.equal(getCache('phase5-cache'), null);
});
