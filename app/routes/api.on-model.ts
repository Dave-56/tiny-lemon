import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import crypto from "node:crypto";
import { logServerEvent } from "../lib/observability.server";
import {
  ON_MODEL_DESCRIPTION,
  ON_MODEL_JOBS_PATH,
  ON_MODEL_PATH,
  ON_MODEL_PRICE_USD,
  OPENAPI_PATH,
  publicOrigin,
} from "../lib/agent/config.server";
import { mppStatus } from "../lib/agent/mpp.server";
import {
  GarmentFetchError,
  JobStartError,
  getAgentPresetModels,
  jobResponse,
  parseOnModelInput,
  resolveGarment,
  startOnModelJob,
  waitForJob,
} from "../lib/agent/onModelJob.server";
import { negotiateAgentPayment } from "../lib/agent/paywall.server";
import { x402Status } from "../lib/agent/x402.server";

/** Holds the connection for up to `wait` seconds (max 110) plus enqueue time. */
export const config = { maxDuration: 120 };

/**
 * GET /api/on-model — free description of the paid endpoint.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = publicOrigin(request);
  const mpp = mppStatus();
  const x402 = x402Status();
  return Response.json(
    {
      name: "Tiny Lemon on-model image",
      description: ON_MODEL_DESCRIPTION,
      price: { amount: ON_MODEL_PRICE_USD, currency: "USD", per: "image" },
      call: { method: "POST", url: `${origin}${ON_MODEL_PATH}`, contentType: "application/json" },
      status: { method: "GET", url: `${origin}${ON_MODEL_JOBS_PATH}/{jobId}`, price: "free" },
      openapi: `${origin}${OPENAPI_PATH}`,
      protocols: {
        mpp: mpp.enabled ? { methods: mpp.methods, testnet: mpp.testnet } : { disabled: mpp.reason },
        x402: x402.enabled
          ? { network: x402.network, payTo: x402.payTo, testnet: x402.testnet }
          : { disabled: x402.reason },
      },
      models: getAgentPresetModels(),
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
};

/**
 * POST /api/on-model — $0.50 per call over MPP or x402.
 *
 * Order matters: validate the body first (free 400), then negotiate payment
 * (402 or verified), then start the job and wait up to `wait` seconds.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET, POST" } });
  }

  let body: unknown;
  const rawBody = await request.clone().text();
  if (rawBody.trim().length === 0) {
    body = {};
  } else {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: "invalid_json", message: "Body must be JSON. See /openapi.json." },
        { status: 400 },
      );
    }
  }

  const parsed = parseOnModelInput(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error, message: parsed.message }, { status: parsed.status });
  }
  const input = parsed.input;

  const outcome = await negotiateAgentPayment(request, body);
  if (outcome.kind === "response") return outcome.response;

  const origin = publicOrigin(request);
  const nonce = crypto.randomUUID();
  let jobId: string;
  try {
    const garment = await resolveGarment(input);
    jobId = await startOnModelJob({
      frontB64: garment.frontB64,
      frontMime: garment.frontMime,
      modelId: input.modelId,
      protocol: outcome.protocol,
      nonce,
    });
  } catch (error) {
    if (error instanceof GarmentFetchError) {
      return outcome.finalize(
        Response.json({ error: "garment_unavailable", message: error.message }, { status: error.status }),
      );
    }
    if (error instanceof JobStartError) {
      return outcome.finalize(
        Response.json({ error: error.code, message: error.message }, { status: error.status }),
      );
    }
    logServerEvent("error", "agent_on_model.unhandled", {
      error: error instanceof Error ? error.message : String(error),
      protocol: outcome.protocol,
      nonce,
    });
    return outcome.finalize(
      Response.json({ error: "generation_unavailable", message: "Could not start generation." }, { status: 502 }),
    );
  }

  const state = await waitForJob(jobId, input.wait * 1000);
  if (!state) {
    return outcome.finalize(
      Response.json({ error: "job_lost", message: "Job was created but could not be read back.", jobId }, { status: 502 }),
    );
  }
  const { status, body: responseBody } = jobResponse(state, origin);
  return outcome.finalize(
    Response.json(responseBody, {
      status,
      headers: { "cache-control": "no-store", ...(status === 202 ? { "retry-after": "5" } : {}) },
    }),
  );
};
