import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { env, getIntegrationStatus } from '../config/env.js';
import { clearCache, getCache, setCache } from '../helpers/cache.js';
import { createHttpError, sendError, sendSuccess } from '../helpers/apiResponse.js';

const requiredFiles = [
  'server.mjs',
  'index.html',
  'script.js',
  'style.css',
  'package.json',
  '.env.example',
  'config/env.js',
  'routes/weather.js',
  'routes/calendar.js',
  'routes/tasks.js',
  'routes/summary.js',
  'routes/capture.js'
];

const optionalBuildFiles = [
  'dist/index.html',
  'dist/capture.html'
];

const requiredScripts = [
  'start',
  'dev',
  'dev:server',
  'dev:client',
  'build',
  'check'
];

let failed = false;

function pass(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`ERR ${message}`);
}

for (const file of requiredFiles) {
  if (existsSync(join(process.cwd(), file))) {
    pass(`${file} exists`);
  } else {
    fail(`${file} is missing`);
  }
}

if (existsSync(join(process.cwd(), 'dist'))) {
  for (const file of optionalBuildFiles) {
    if (existsSync(join(process.cwd(), file))) {
      pass(`${file} exists`);
    } else {
      fail(`${file} is missing; run npm run build to refresh the production build`);
    }
  }
} else {
  console.log('INFO dist/ does not exist yet. npm start will fall back to root files until you run npm run build.');
}

try {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  for (const script of requiredScripts) {
    if (packageJson.scripts?.[script]) {
      pass(`npm script "${script}" exists`);
    } else {
      fail(`npm script "${script}" is missing`);
    }
  }
} catch (error) {
  fail(`package.json could not be read: ${error.message}`);
}

const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
for (const name of Object.keys(env)) {
  if (example.includes(`${name}=`)) {
    pass(`.env.example documents ${name}`);
  } else {
    fail(`.env.example does not document ${name}`);
  }
}

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

const successResponse = createMockResponse();
sendSuccess(successResponse, { data: { ok: true }, source: 'check' });
if (successResponse.statusCode === 200 && successResponse.body?.success === true && successResponse.body?.source === 'check') {
  pass('API success helper returns the standard envelope');
} else {
  fail('API success helper returned an unexpected shape');
}

const errorResponse = createMockResponse();
sendError(errorResponse, createHttpError('Check missing config', {
  statusCode: 503,
  code: 'CHECK_NOT_CONFIGURED',
  details: { integration: 'check' }
}), 'Check failed');
if (
  errorResponse.statusCode === 503 &&
  errorResponse.body?.success === false &&
  errorResponse.body?.code === 'CHECK_NOT_CONFIGURED' &&
  errorResponse.body?.details?.integration === 'check'
) {
  pass('API error helper returns safe code and details');
} else {
  fail('API error helper returned an unexpected shape');
}

setCache('check_cache_key', { ok: true }, 1000);
if (getCache('check_cache_key')?.ok === true) {
  pass('cache helper stores and reads values');
} else {
  fail('cache helper did not return a stored value');
}
clearCache('check_cache_key');
if (getCache('check_cache_key') === null) {
  pass('cache helper clears values');
} else {
  fail('cache helper did not clear a stored value');
}

console.log('\nOptional integration status from your current environment:');
for (const [name, status] of Object.entries(getIntegrationStatus())) {
  if (status.configured) {
    console.log(`- ${name}: configured`);
  } else {
    console.log(`- ${name}: missing ${status.missing.join(', ')}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nSmoke check passed. This does not call external APIs or require real secrets.');
