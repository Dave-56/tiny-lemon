/**
 * Shared configuration for the agent-facing, pay-per-call on-model endpoint.
 *
 * The endpoint is sold to machines (MPP and x402 buyers), not to Shopify
 * merchants, so it runs under its own system shop id and never touches the
 * credit ledger. See PAIN.md at the repo root for every external blocker met
 * while wiring the payment rails.
 */

/** System shop that owns every agent-generated outfit. No credits, no plan. */
export const AGENT_SHOP_ID = process.env.AGENT_SHOP_ID ?? "__agent__";

/** Price per successful call, in USD display units. Stripe SPT minimum is 0.50. */
export const ON_MODEL_PRICE_USD = "0.50";

export const ON_MODEL_PATH = "/api/on-model";
export const ON_MODEL_JOBS_PATH = "/api/on-model/jobs";
export const OPENAPI_PATH = "/openapi.json";

/** How long the paid call holds the connection before handing back a job to poll. */
export const ON_MODEL_DEFAULT_WAIT_SECONDS = 20;
/** Hard ceiling; the route's Vercel maxDuration is 120s. */
export const ON_MODEL_MAX_WAIT_SECONDS = 110;

export const ON_MODEL_DEFAULT_MODEL_ID = "model-01";

export const ON_MODEL_SUMMARY = "Generate one on-model studio photo from a garment flat-lay";
export const ON_MODEL_DESCRIPTION =
  "Upload a garment flat-lay (or link to one) and receive a photorealistic front-facing " +
  "studio shot of a model wearing it. One image per call, 800x1200 PNG. Generation takes " +
  "45-90 seconds: the call waits up to `wait` seconds and then returns a job to poll for free.";

export function isAgentPaymentsTestnet(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AGENT_PAYMENTS_TESTNET === "true") return true;
  if (env.AGENT_PAYMENTS_TESTNET === "false") return false;
  return env.STRIPE_SECRET_KEY?.includes("_test_") ?? false;
}

/** Public origin agents should use in follow-up calls (status URL, OpenAPI servers). */
export function publicOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.AGENT_PUBLIC_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  const host = forwardedHost ?? url.host;
  return `${proto}://${host}`;
}

/** MPP realm. Must equal the hostname agents connect to, or `mppx validate` warns. */
export function realmFor(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MPP_REALM?.trim();
  if (explicit) return explicit;
  return new URL(publicOrigin(request, env)).hostname;
}

export function jobStatusUrl(origin: string, jobId: string): string {
  return `${origin}${ON_MODEL_JOBS_PATH}/${encodeURIComponent(jobId)}`;
}
