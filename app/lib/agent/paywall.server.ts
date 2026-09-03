/**
 * Dual-protocol paywall: one route, one price, paid over MPP or x402.
 *
 * Negotiation order:
 *   1. x402 credential header present → verify with the x402 facilitator,
 *      run the handler, settle after a successful (2xx) response.
 *   2. otherwise → MPP. `mppx.charge` returns either a 402 challenge or a
 *      verified payment with `withReceipt`. On the 402 we also attach the
 *      x402 `PAYMENT-REQUIRED` header so a single challenge advertises both
 *      protocols.
 */
import { logServerEvent } from "../observability.server";
import { realmFor } from "./config.server";
import { getOnModelCharge, mppStatus } from "./mpp.server";
import {
  getX402Http,
  instructionsToResponse,
  x402Context,
  x402CredentialHeader,
  x402Status,
} from "./x402.server";

export type PaywallOutcome =
  | { kind: "response"; response: Response }
  | {
      kind: "paid";
      protocol: "mpp" | "x402";
      /** Wraps the handler's response with receipt/settlement headers. */
      finalize: (response: Response) => Promise<Response>;
    };

function copyX402Headers(from: Record<string, string>, to: Headers) {
  for (const [key, value] of Object.entries(from)) {
    const lower = key.toLowerCase();
    if (lower === "payment-required" || lower === "x-payment-required" || lower === "cache-control") {
      if (lower === "cache-control" && to.has("cache-control")) continue;
      to.set(key, value);
    }
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function withHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function negotiateAgentPayment(request: Request, body: unknown): Promise<PaywallOutcome> {
  const x402Enabled = x402Status().enabled;
  const mppEnabled = mppStatus().enabled;
  const x402Header = x402Enabled ? x402CredentialHeader(request) : undefined;

  // ── x402 ───────────────────────────────────────────────────────────────────
  if (x402Header) {
    const http = await getX402Http();
    if (http) {
      const context = x402Context(request, body, x402Header);
      const result = await http.processHTTPRequest(context);
      if (result.type === "payment-error") {
        return { kind: "response", response: instructionsToResponse(result.response) };
      }
      if (result.type === "no-payment-required") {
        return { kind: "paid", protocol: "x402", finalize: async (response) => response };
      }
      return {
        kind: "paid",
        protocol: "x402",
        finalize: async (response) => {
          if (response.status < 200 || response.status >= 300) {
            // Nothing is settled for the default authorization flow, so the
            // buyer keeps their funds when we could not produce the job.
            logServerEvent("warn", "agent_payment.not_settled", {
              protocol: "x402",
              status: response.status,
            });
            return response;
          }
          const settlement = await http.processSettlement(
            result.paymentPayload,
            result.paymentRequirements,
            result.declaredExtensions,
            { request: context, responseHeaders: headersToRecord(response.headers) },
          );
          if (!settlement.success) {
            logServerEvent("error", "agent_payment.settle_failed", {
              protocol: "x402",
              reason: (settlement as { errorReason?: string }).errorReason ?? null,
            });
            return instructionsToResponse(
              (settlement as unknown as { response: Parameters<typeof instructionsToResponse>[0] }).response ?? {
                status: 402,
                headers: {},
                body: { error: "settlement_failed" },
              },
            );
          }
          logServerEvent("info", "agent_payment.success", {
            protocol: "x402",
            network: settlement.network,
            reference: settlement.transaction,
            payer: settlement.payer,
          });
          return withHeaders(response, http.createSettlementHeaders(settlement));
        },
      };
    }
  }

  // ── MPP ────────────────────────────────────────────────────────────────────
  const realm = realmFor(request);
  const charge = mppEnabled ? await getOnModelCharge(realm) : null;

  if (!charge) {
    if (x402Enabled) {
      const http = await getX402Http();
      if (http) {
        const result = await http.processHTTPRequest(x402Context(request, body));
        if (result.type === "payment-error") {
          return { kind: "response", response: instructionsToResponse(result.response) };
        }
      }
    }
    return {
      kind: "response",
      response: Response.json(
        {
          error: "payments_not_configured",
          message: "This endpoint is paid but no payment rail is configured on the server.",
        },
        { status: 503 },
      ),
    };
  }

  const result = await charge(request);
  if (result.status === 402) {
    let challenge = result.challenge;
    if (x402Enabled) {
      const http = await getX402Http();
      if (http) {
        const x402Result = await http.processHTTPRequest(x402Context(request, body));
        if (x402Result.type === "payment-error") {
          const headers = new Headers(challenge.headers);
          copyX402Headers(x402Result.response.headers, headers);
          challenge = new Response(challenge.body, {
            status: challenge.status,
            statusText: challenge.statusText,
            headers,
          });
        }
      }
    }
    return { kind: "response", response: challenge };
  }

  return {
    kind: "paid",
    protocol: "mpp",
    finalize: async (response) => result.withReceipt(response),
  };
}
