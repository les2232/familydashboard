import 'dotenv/config';

export const env = {
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_ASSISTANT_ID: process.env.OPENAI_ASSISTANT_ID,
  DASHBOARD_ALLOWED_ORIGINS: process.env.DASHBOARD_ALLOWED_ORIGINS,
};

export const optionalIntegrations = {
  weather: ['WEATHER_API_KEY'],
  calendar: ['GOOGLE_CALENDAR_ID', 'GOOGLE_API_KEY'],
  googleTasks: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
  openaiChat: ['OPENAI_API_KEY'],
  openaiAssistant: ['OPENAI_API_KEY', 'OPENAI_ASSISTANT_ID'],
};

export function getMissingEnv(names) {
  return names.filter(name => !env[name]);
}

export function getIntegrationStatus() {
  return Object.fromEntries(
    Object.entries(optionalIntegrations).map(([name, variables]) => [
      name,
      {
        configured: getMissingEnv(variables).length === 0,
        missing: getMissingEnv(variables)
      }
    ])
  );
}

export function logEnvironmentStatus() {
  console.log('Environment check: core server can start.');
  console.log('Optional integrations:');

  for (const [name, status] of Object.entries(getIntegrationStatus())) {
    if (status.configured) {
      console.log(`- ${name}: configured`);
    } else {
      console.warn(`- ${name}: missing ${status.missing.join(', ')}. Related routes will return a helpful error.`);
    }
  }
}
