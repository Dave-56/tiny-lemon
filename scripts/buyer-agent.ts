/**
 * Buyer-side agent for the paid on-model endpoint (sandbox / testnet only).
 *
 * Acts like a customer agent: calls POST /api/on-model, answers the MPP 402
 * with a credential, polls the free status URL, downloads the image, and
 * writes a ledger line with everything the buyer actually received.
 *
 * Usage:
 *   npx tsx scripts/buyer-agent.ts --rail stripe   # Stripe SPT via a test card
 *   npx tsx scripts/buyer-agent.ts --rail tempo    # Tempo testnet (faucet)
 *   npx tsx scripts/buyer-agent.ts --rail stripe --garment data:image/png;base64,...  # force a bad input
 *
 * Env: BUYER_BASE_URL (default http://localhost:4242). For --rail stripe the
 * buyer needs a way to mint a Shared Payment Token; there is no customer-side
 * way without the Link CLI browser login, so this script mints one with
 * BUYER_STRIPE_SECRET_KEY (a sandbox key) exactly like `mppx validate` does.
 * Ledger: scripts/buyer-ledger.jsonl (append-only).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { Actions } from "viem/tempo";
import { tempoModerato } from "viem/tempo/chains";
import { Mppx, tempo } from "mppx/client";
import { stripe as stripeClient } from "mppx/stripe/client";

type Rail = "stripe" | "tempo";

/** What the endpoint's paid/poll responses look like from the buyer's side. */
type JobResponse = {
  status?: string;
  jobId?: string;
  statusUrl?: string;
  pollAfterSeconds?: number;
  image?: { url?: string };
  error?: string;
  message?: string;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const rail = (arg("rail", "stripe") as Rail) ?? "stripe";
const baseUrl = (process.env.BUYER_BASE_URL ?? "http://localhost:4242").replace(/\/$/, "");
const garment = arg("garment", "https://tinylemon.xyz/landing-before.png")!;
const modelId = arg("model", "model-01")!;
const wait = Number(arg("wait", "20"));
const ledgerPath = path.join(process.cwd(), "scripts", "buyer-ledger.jsonl");
const outDir = path.join(process.cwd(), "scripts", "buyer-downloads");

function log(msg: string) {
  console.log(`[buyer] ${msg}`);
}

async function buildClient(): Promise<{ mppx: ReturnType<typeof Mppx.create>; payer: string }> {
  if (rail === "tempo") {
    const key = process.env.BUYER_TEMPO_PRIVATE_KEY ?? generatePrivateKey();
    const account = privateKeyToAccount(key as `0x${string}`);
    const client = createClient({ chain: tempoModerato, transport: http() });
    log(`tempo testnet wallet ${account.address}; funding from faucet…`);
    const hashes = await Actions.faucet.fund(client, { account });
    await Promise.all(hashes.map((hash) => waitForTransactionReceipt(client, { hash })));
    await new Promise((r) => setTimeout(r, 4000));
    return { mppx: Mppx.create({ methods: [...tempo({ account })], polyfill: false }), payer: account.address };
  }
  const secretKey = process.env.BUYER_STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith("sk_test_")) {
    throw new Error("BUYER_STRIPE_SECRET_KEY (sandbox) is required for --rail stripe; a real buyer would use `npx @stripe/link-cli` instead.");
  }
  // Same path `mppx validate` takes: mint a Shared Payment Token for the test
  // card through Stripe's test helper. A real buyer cannot do this; only
  // Link (via link-cli, browser login) issues SPTs for a customer.
  const method = stripeClient.charge({
    paymentMethod: "pm_card_visa",
    createToken: async ({ paymentMethod, amount, currency, networkId, expiresAt, metadata }) => {
      const baseForm = () =>
        new URLSearchParams({
          payment_method: paymentMethod ?? "pm_card_visa",
          "usage_limits[currency]": currency,
          "usage_limits[max_amount]": amount,
          "usage_limits[expires_at]": String(expiresAt),
        });
      const mint = async (form: URLSearchParams) => {
        const res = await fetch("https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens", {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
            "Stripe-Version": "2026-07-29.preview",
          },
          body: form,
        });
        return { ok: res.ok, status: res.status, json: (await res.json()) as { id?: string; error?: { message: string } } };
      };
      const full = baseForm();
      if (networkId) full.set("seller_details[network_id]", networkId);
      for (const [k, v] of Object.entries(metadata ?? {})) full.set(`metadata[${k}]`, String(v));
      let out = await mint(full);
      // The test helper rejects seller_details/metadata on some API versions;
      // mppx validate retries bare, so do the same. (Gap: the token then carries
      // no seller binding and no memo of what it was for.)
      if (!out.ok && out.json.error?.message.includes("Received unknown parameter")) {
        log(`SPT mint retry without seller_details/metadata (${out.json.error.message})`);
        out = await mint(baseForm());
      }
      if (!out.ok || !out.json.id) throw new Error(`SPT mint failed: ${out.json.error?.message ?? out.status}`);
      return out.json.id;
    },
  });
  return { mppx: Mppx.create({ methods: [method], polyfill: false }), payer: "pm_card_visa (sandbox SPT)" };
}

async function main() {
  const startedAt = new Date().toISOString();
  const body = JSON.stringify(
    garment.startsWith("data:") ? { garmentImageBase64: garment, modelId, wait } : { garmentImageUrl: garment, modelId, wait },
  );
  const url = `${baseUrl}/api/on-model`;
  const { mppx, payer } = await buildClient();

  // 1. Unpaid request → 402 with the offers.
  const challengeRes = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  log(`unpaid POST → ${challengeRes.status}`);
  if (challengeRes.status !== 402) {
    console.log(await challengeRes.text());
    throw new Error("expected 402");
  }
  const wwwAuth = challengeRes.headers.get("www-authenticate") ?? "";
  const offers = [...wwwAuth.matchAll(/method="([^"]+)", intent="([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
  log(`offers: ${offers.join(", ")}`);

  // 2. Pay: build a credential for the matching offer and retry.
  const credential = await mppx.createCredential(challengeRes.clone());
  const paidRes = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: credential },
    body,
  });
  const receiptHeader = paidRes.headers.get("payment-receipt");
  const receipt = receiptHeader ? JSON.parse(Buffer.from(receiptHeader, "base64url").toString()) : null;
  const paidBody = (await paidRes.json().catch(() => ({}))) as JobResponse;
  log(`paid POST → ${paidRes.status} status=${paidBody.status ?? paidBody.error} jobId=${paidBody.jobId ?? "-"}`);
  log(`receipt: ${receipt ? `${receipt.method} ${receipt.status} ref=${receipt.reference}` : "NONE"}`);

  // 3. Poll the free status URL.
  let final = paidBody;
  let polls = 0;
  while (final.status === "processing" && final.statusUrl && polls < 60) {
    await new Promise((r) => setTimeout(r, (final.pollAfterSeconds ?? 5) * 1000));
    final = (await (await fetch(final.statusUrl)).json()) as JobResponse;
    polls++;
  }
  log(`final status=${final.status} after ${polls} polls`);

  // 4. Download the image.
  let file: string | null = null;
  if (final.status === "completed" && final.image?.url) {
    fs.mkdirSync(outDir, { recursive: true });
    const img = await fetch(final.image.url);
    file = path.join(outDir, `${final.jobId}.png`);
    fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
    log(`downloaded ${file} (${fs.statSync(file).size} bytes)`);
  }

  // 5. Ledger: everything the buyer knows, nothing more.
  const entry = {
    startedAt,
    finishedAt: new Date().toISOString(),
    rail,
    payer,
    endpoint: url,
    request: { garment: garment.slice(0, 80), modelId, wait },
    paidHttpStatus: paidRes.status,
    receipt,
    jobId: final.jobId ?? null,
    outcome: final.status ?? final.error ?? "unknown",
    error: final.error ?? final.message ?? null,
    imageUrl: final.image?.url ?? null,
    file,
    // The buyer never learns a price in a currency it can add up: the receipt
    // has no amount; the 402 offer had one, in token units.
    offerAmounts: [...wwwAuth.matchAll(/request="([^"]+)"/g)].map((m) => {
      try {
        const r = JSON.parse(Buffer.from(m[1], "base64url").toString());
        return { method: r.method ?? null, amount: r.amount, currency: r.currency };
      } catch {
        return null;
      }
    }),
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + "\n");
  log(`ledger appended → ${ledgerPath}`);
}

main().catch((error) => {
  console.error("[buyer] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
