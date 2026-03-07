import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  // Replace with your Trigger.dev project reference from the dashboard
  // (e.g. "proj_xxxxxxxxxxxxxxxx"). Set TRIGGER_PROJECT_ID in env or hardcode here.
  project: 'proj_xsbppmkqnxvghowxmstj',
  dirs: ['./trigger'],
  // Default ceiling for all tasks (individual tasks can override with their own maxDuration)
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
});
