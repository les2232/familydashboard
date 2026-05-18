import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { env, getIntegrationStatus } from '../config/env.js';

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
