/**
 * Machine Payments Protocol (MPP) server for the agent endpoint.
 *
 * Methods are picked from the environment:
 *   - `STRIPE_SECRET_KEY` + `STRIPE_PROFILE_ID` → Stripe machine payments
 *     (SPT cards + Tempo via Stripe deposit address, per the Stripe MPP doc).
 *   - otherwise `AGENT_PAYOUT_EVM_ADDRESS` → direct Tempo TIP-20 charge
 *     (testnet when `AGENT_PAYMENTS_TESTNET=true`).
 *
 * One `Mppx` instance is cached per realm because the realm is baked into
 * every challenge and must match the hostname the agent used.
 */
import crypto from "node:crypto";
import { Mppx, stripe, tempo } from "mppx/server";
import { logServerEvent } from "../observability.server";
import { ON_MODEL_PATH, ON_MODEL_PRICE_USD, ON_MODEL_SUMMARY, isAgentPaymentsTestnet } from "./config.server";

export type MppStatus =
  | { enabled: true; provider: "stripe" | "tempo"; testnet: boolean; methods: string[] }
  | { enabled: false; reason: string };

export function mppStatus(env: NodeJS.ProcessEnv = process.env): MppStatus {
  const testnet = isAgentPaymentsTestnet(env);
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PROFILE_ID) {
    return { enabled: true, provider: "stripe", testnet, methods: ["tempo/charge", "stripe/charge"] };
  }
  if (env.AGENT_PAYOUT_EVM_ADDRESS) {
    return { enabled: true, provider: "tempo", testnet, methods: ["tempo/charge"] };
  }
  return {
    enabled: false,
    reason:
      "Set STRIPE_SECRET_KEY + STRIPE_PROFILE_ID (Stripe machine payments) or AGENT_PAYOUT_EVM_ADDRESS (direct Tempo).",
  };
}

function resolveSecretKey(env: NodeJS.ProcessEnv): string | undefined {
  if (env.MPP_SECRET_KEY) return env.MPP_SECRET_KEY;
  // Same derivation the Stripe MPP sample uses, falling back to the app secret
  // so production challenges stay bound even before MPP_SECRET_KEY is set.
  const seed = env.STRIPE_SECRET_KEY ?? env.SHOPIFY_API_SECRET;
  if (!seed) return undefined;
  return crypto.createHmac("sha256", seed).update("mpp-challenge-signing").digest("base64");
}

async function buildMethods(env: NodeJS.ProcessEnv) {
  const status = mppStatus(env);
  if (!status.enabled) return null;

  if (status.provider === "stripe") {
    const { default: Stripe } = await import("stripe");
    const client = new Stripe(env.STRIPE_SECRET_KEY!);
    // mppx only offers the Tempo rail when it has a deposit address. With a
    // plain object (or nothing) it never calls Stripe, so pass a resolver that
    // finds or creates the address unless TEMPO_DEPOSIT_ADDRESS pins one.
    const machinePayments = stripe.create({
      client,
      networkId: env.STRIPE_PROFILE_ID!,
      livemode: !env.STRIPE_SECRET_KEY!.includes("_test_"),
      depositAddresses: env.TEMPO_DEPOSIT_ADDRESS
        ? { tempo: env.TEMPO_DEPOSIT_ADDRESS }
        : (network) => stripe.findOrCreateDepositAddress(client, network),
    });
    return await machinePayments.defaultMethods();
  }

  return tempo({
    recipient: env.AGENT_PAYOUT_EVM_ADDRESS as `0x${string}`,
    testnet: status.testnet,
  });
}

export type ChargeResult =
  | { status: 402; challenge: Response }
  | { status: 200; withReceipt: (response: Response) => Response };

export type ChargeHandler = ((request: Request) => Promise<ChargeResult>) & { _internal?: unknown };

/**
 * Structural view of the mppx instance. The real generic type encodes every
 * configured method, which differs between the Stripe and Tempo branches, so
 * we erase it here and keep only what the endpoint and discovery use.
 */
export type AgentMppx = {
  methods: readonly unknown[];
  realm: string;
  charge(options: { amount: string; description?: string; scope?: string }): ChargeHandler;
  onPaymentSuccess(
    handler: (context: {
      receipt: { reference?: string };
      method: { name: string; intent: string };
      request: { amount?: string };
    }) => void,
  ): () => void;
  onPaymentFailed(
    handler: (context: { error: { message: string }; method: { name: string; intent: string } }) => void,
  ): () => void;
};

const instances = new Map<string, Promise<AgentMppx | null>>();

/** Returns the MPP server for a realm, or null when no rail is configured. */
export function getMppx(realm: string, env: NodeJS.ProcessEnv = process.env): Promise<AgentMppx | null> {
  const existing = instances.get(realm);
  if (existing) return existing;
  const pending: Promise<AgentMppx | null> = (async () => {
    const methods = await buildMethods(env);
    if (!methods) return null;
    const secretKey = resolveSecretKey(env);
    if (!secretKey) {
      logServerEvent("error", "agent_mpp.missing_secret", {});
      return null;
    }
    const mppx = Mppx.create({ methods, secretKey, realm }) as unknown as AgentMppx;
    mppx.onPaymentSuccess(({ receipt, method, request }) => {
      logServerEvent("info", "agent_payment.success", {
        protocol: "mpp",
        method: `${method.name}/${method.intent}`,
        reference: receipt.reference,
        amount: request.amount,
        realm,
      });
    });
    mppx.onPaymentFailed(({ error, method }) => {
      logServerEvent("warn", "agent_payment.failed", {
        protocol: "mpp",
        method: `${method.name}/${method.intent}`,
        error: error.message,
        realm,
      });
    });
    return mppx;
  })();
  instances.set(realm, pending);
  pending.catch(() => instances.delete(realm));
  return pending;
}

const chargeHandlers = new Map<string, Promise<ChargeHandler | null>>();

/** The $0.50 charge handler for `POST /api/on-model` on a given realm. */
export function getOnModelCharge(realm: string, env: NodeJS.ProcessEnv = process.env): Promise<ChargeHandler | null> {
  const existing = chargeHandlers.get(realm);
  if (existing) return existing;
  const pending = getMppx(realm, env).then((mppx) =>
    mppx
      ? mppx.charge({
          amount: ON_MODEL_PRICE_USD,
          description: ON_MODEL_SUMMARY,
          scope: `POST ${ON_MODEL_PATH}`,
        })
      : null,
  );
  chargeHandlers.set(realm, pending);
  pending.catch(() => chargeHandlers.delete(realm));
  return pending;
}
