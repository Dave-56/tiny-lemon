/**
 * Re-exports the Trigger.dev SDK's `tasks` helper for use in server-side
 * action/loader code. The .server.ts suffix ensures Vite never bundles
 * this into the client chunk.
 *
 * Required env vars (set in Vercel + Trigger.dev dashboard):
 *   TRIGGER_SECRET_KEY  — your Trigger.dev secret key
 */
export { tasks } from '@trigger.dev/sdk/v3';
