/**
 * x402 resource server for the agent endpoint, with the Bazaar discovery
 * extension declared so the CDP facilitator can index the route.
 *
 * Facilitator selection:
 *   - `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` → Coinbase CDP facilitator
 *     (required for Base mainnet and for Bazaar indexing).
 *   - otherwise `X402_FACILITATOR_URL` (default https://x402.org/facilitator),
 *     which only settles testnets and never feeds the Bazaar.
 *
 * Receiving address: `X402_PAY_TO`, falling back to `AGENT_PAYOUT_EVM_ADDRESS`.
 */
import type { HTTPAdapter, HTTPRequestContext, HTTPResponseInstructions } from "@x402/core/http";
import type { RoutesConfig } from "@x402/core/server";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { logServerEvent } from "../observability.server";
import {
  ON_MODEL_DESCRIPTION,
  ON_MODEL_PATH,
  ON_MODEL_PRICE_USD,
  isAgentPaymentsTestnet,
} from "./config.server";
import {
  ON_MODEL_EXAMPLE_INPUT,
  ON_MODEL_EXAMPLE_OUTPUT,
  onModelInputSchema,
  onModelOutputSchema,
} from "./onModelJob.server";

export const BASE_MAINNET = "eip155:8453";
export const BASE_SEPOLIA = "eip155:84532";
export const DEFAULT_TESTNET_FACILITATOR = "https://x402.org/facilitator";

export type X402Network = `${string}:${string}`;

export type X402Status =
  | {
      enabled: true;
      network: X402Network;
      payTo: string;
      facilitator: "cdp" | "keyless";
      facilitatorUrl?: string;
      testnet: boolean;
    }
  | { enabled: false; reason: string };

export function x402Status(env: NodeJS.ProcessEnv = process.env): X402Status {
  const payTo = (env.X402_PAY_TO ?? env.AGENT_PAYOUT_EVM_ADDRESS ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    return { enabled: false, reason: "Set X402_PAY_TO (or AGENT_PAYOUT_EVM_ADDRESS) to a 0x receiving address." };
  }
  const testnet = isAgentPaymentsTestnet(env);
  const hasCdp = Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET);
  const configured = env.X402_NETWORK?.trim();
  const network = (configured && /^[a-z0-9]+:[A-Za-z0-9]+$/.test(configured)
    ? configured
    : testnet
      ? BASE_SEPOLIA
      : BASE_MAINNET) as X402Network;
  if (hasCdp) {
    return { enabled: true, network, payTo, facilitator: "cdp", testnet };
  }
  if (!testnet) {
    return {
      enabled: false,
      reason: "Base mainnet needs the CDP facilitator: set CDP_API_KEY_ID + CDP_API_KEY_SECRET.",
    };
  }
  return {
    enabled: true,
    network,
    payTo,
    facilitator: "keyless",
    facilitatorUrl: env.X402_FACILITATOR_URL ?? DEFAULT_TESTNET_FACILITATOR,
    testnet,
  };
}

export const ON_MODEL_ROUTE_KEY = `POST ${ON_MODEL_PATH}`;

export function onModelBazaarDeclaration(): Record<string, unknown> {
  return declareDiscoveryExtension({
    bodyType: "json",
    input: ON_MODEL_EXAMPLE_INPUT,
    inputSchema: onModelInputSchema(),
    output: { example: ON_MODEL_EXAMPLE_OUTPUT, schema: onModelOutputSchema() },
  });
}

function buildRoutes(status: Extract<X402Status, { enabled: true }>): RoutesConfig {
  return {
    [ON_MODEL_ROUTE_KEY]: {
      accepts: [
        {
          scheme: "exact",
          price: `$${ON_MODEL_PRICE_USD}`,
          network: status.network,
          payTo: status.payTo,
          maxTimeoutSeconds: 300,
        },
      ],
      description: ON_MODEL_DESCRIPTION,
      mimeType: "application/json",
      extensions: { ...onModelBazaarDeclaration() },
    },
  };
}

let httpServerPromise: Promise<x402HTTPResourceServer | null> | null = null;

/** Initialized x402 HTTP resource server, or null when x402 is not configured. */
export function getX402Http(env: NodeJS.ProcessEnv = process.env): Promise<x402HTTPResourceServer | null> {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      const status = x402Status(env);
      if (!status.enabled) return null;

      let facilitator: HTTPFacilitatorClient;
      let extensions;
      if (status.facilitator === "cdp") {
        const cdp = await import("@coinbase/cdp-sdk/x402");
        facilitator = cdp.createCdpFacilitatorClient({
          apiKeyId: env.CDP_API_KEY_ID,
          apiKeySecret: env.CDP_API_KEY_SECRET,
        });
        extensions = cdp.getCdpExtensionRegistrations();
      } else {
        facilitator = new HTTPFacilitatorClient({ url: status.facilitatorUrl });
        extensions = [bazaarResourceServerExtension];
      }

      const resourceServer = new x402ResourceServer(facilitator).register(
        status.network,
        new ExactEvmScheme(),
      );
      for (const extension of extensions) resourceServer.registerExtension(extension);

      const http = new x402HTTPResourceServer(resourceServer, buildRoutes(status));
      await http.initialize();
      logServerEvent("info", "agent_x402.ready", {
        network: status.network,
        facilitator: status.facilitator,
        payTo: status.payTo,
      });
      return http;
    })();
    httpServerPromise.catch((error) => {
      logServerEvent("error", "agent_x402.init_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      httpServerPromise = null;
    });
  }
  return httpServerPromise;
}

/** Reads the x402 credential header (v2 `PAYMENT-SIGNATURE`, v1 `X-PAYMENT`). */
export function x402CredentialHeader(request: Request): string | undefined {
  return request.headers.get("payment-signature") ?? request.headers.get("x-payment") ?? undefined;
}

/** Minimal `HTTPAdapter` over a Fetch `Request` whose body was already parsed. */
export class FetchHttpAdapter implements HTTPAdapter {
  private readonly url: URL;
  constructor(private readonly request: Request, private readonly body: unknown) {
    this.url = new URL(request.url);
  }
  getHeader(name: string) {
    return this.request.headers.get(name) ?? undefined;
  }
  getMethod() {
    return this.request.method.toUpperCase();
  }
  getPath() {
    return this.url.pathname;
  }
  getUrl() {
    return this.request.url;
  }
  getAcceptHeader() {
    return this.request.headers.get("accept") ?? "";
  }
  getUserAgent() {
    return this.request.headers.get("user-agent") ?? "";
  }
  getQueryParams() {
    const out: Record<string, string | string[]> = {};
    for (const [key, value] of this.url.searchParams) {
      const existing = out[key];
      if (existing === undefined) out[key] = value;
      else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
    return out;
  }
  getQueryParam(name: string) {
    const values = this.url.searchParams.getAll(name);
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : values;
  }
  getBody() {
    return this.body;
  }
}

export function x402Context(request: Request, body: unknown, paymentHeader?: string): HTTPRequestContext {
  return {
    adapter: new FetchHttpAdapter(request, body),
    method: request.method.toUpperCase(),
    path: new URL(request.url).pathname,
    ...(paymentHeader ? { paymentHeader } : {}),
  };
}

export function instructionsToResponse(instructions: HTTPResponseInstructions): Response {
  const headers = new Headers(instructions.headers);
  if (instructions.isHtml) {
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(String(instructions.body ?? ""), { status: instructions.status, headers });
  }
  if (instructions.body === undefined) {
    return new Response(null, { status: instructions.status, headers });
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const body = typeof instructions.body === "string" ? instructions.body : JSON.stringify(instructions.body);
  return new Response(body, { status: instructions.status, headers });
}
