# Agent endpoint: `POST /api/on-model` ($0.50 per image)

A headless, pay-per-call version of the core product for AI agents. One call
takes a garment flat-lay and returns one front-facing on-model studio photo.
Payment is accepted over **MPP** (Stripe machine payments or direct Tempo) and
**x402** (Base USDC via the Coinbase facilitator). Discovery is served at
`/openapi.json` for MPPScan, x402scan, and AgentCash.

Blockers met while building this live in [`../PAIN.md`](../PAIN.md).

## Routes

| Route | Price | What |
| --- | --- | --- |
| `GET /api/on-model` | free | Description, price, protocols, preset models |
| `POST /api/on-model` | $0.50 | Start a generation; waits up to `wait` s (default 20, max 110) |
| `GET /api/on-model/jobs/{jobId}` | free | Poll a job until `status` is `completed` |
| `GET /openapi.json` | free | OpenAPI 3.1 discovery document |

Request body (JSON): `garmentImageUrl` (https) **or** `garmentImageBase64`
(+ optional `mimeType`), optional `modelId` (preset id, default `model-01`),
optional `wait`. Responses: `200` image ready, `202` still generating (poll
`statusUrl`), `400`/`413` rejected before payment, `402` payment required,
`502` generation failed after payment.

Flow inside the route (`app/routes/api.on-model.ts`):

1. Parse and validate the body. Bad input is a free 400.
2. `negotiateAgentPayment` (`app/lib/agent/paywall.server.ts`): x402 credential
   header → verify with the facilitator; otherwise MPP `mppx.charge`. With no
   credential the 402 carries both `WWW-Authenticate: Payment` and
   `PAYMENT-REQUIRED` headers.
3. Download/decode the garment, enqueue the normal `generate-outfit`
   Trigger.dev task under the `__agent__` system shop (no credit ledger,
   front pose only), poll the outfit row for up to `wait` seconds.
4. Return 200/202/502 wrapped with the MPP receipt or x402 settlement header.
   x402 is only settled on a 2xx, so a failed enqueue does not charge.

## Environment

| Variable | Purpose |
| --- | --- |
| `MPP_SECRET_KEY` | HMAC key binding MPP challenges (`openssl rand -base64 32`). Falls back to an HMAC of `STRIPE_SECRET_KEY` or `SHOPIFY_API_SECRET`. |
| `STRIPE_SECRET_KEY`, `STRIPE_PROFILE_ID` | Enables Stripe machine payments (SPT cards + Tempo via Stripe). `TEMPO_DEPOSIT_ADDRESS` optional. |
| `AGENT_PAYOUT_EVM_ADDRESS` | Direct Tempo recipient when Stripe is not configured; also the x402 `payTo` fallback. |
| `X402_PAY_TO` | x402 receiving address (overrides the fallback). |
| `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | Coinbase CDP facilitator. Required for Base mainnet and for Bazaar indexing. |
| `X402_FACILITATOR_URL` | Keyless facilitator for testnets (default `https://x402.org/facilitator`). |
| `X402_NETWORK` | CAIP-2 override (`eip155:8453` mainnet, `eip155:84532` Sepolia). |
| `AGENT_PAYMENTS_TESTNET` | `true` = Tempo Moderato + Base Sepolia. Defaults to true only when the Stripe key is a test key. |
| `MPP_REALM`, `AGENT_PUBLIC_ORIGIN` | Override the realm / public origin (otherwise derived from the request host). |
| `AGENT_SHOP_ID` | System shop id (default `__agent__`). |

## Validate locally

```bash
vercel env pull --environment=production .env.local   # DB, blob, Trigger secrets
# add MPP_SECRET_KEY, AGENT_PAYOUT_EVM_ADDRESS, AGENT_PAYMENTS_TESTNET=true
PORT=4242 node --env-file=.env.local node_modules/.bin/react-router dev
npx mppx@latest validate http://localhost:4242          # funds a Tempo testnet wallet and pays once
npx -y @agentcash/discovery@latest discover http://localhost:4242
npx -y @agentcash/discovery@latest check http://localhost:4242/api/on-model
```

Every `mppx validate` run makes a real (testnet) payment and a real generation.
To iterate on the discovery document only:

```bash
curl -s http://localhost:4242/openapi.json > /tmp/openapi.json
node --input-type=module -e "import fs from 'node:fs'; const m = await import('mppx/discovery'); console.log(m.validate(JSON.parse(fs.readFileSync('/tmp/openapi.json','utf8'))))"
```

## Going live (after merge to `main`)

1. Vercel env: `MPP_SECRET_KEY`, the payout address, Stripe keys if using
   cards, `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`, `AGENT_PAYMENTS_TESTNET=false`.
2. `npm run trigger:deploy` so the worker carries the shared billing change.
3. Check `https://tinylemon.xyz/openapi.json` and
   `npx mppx@latest validate https://tinylemon.xyz` (mainnet: real money).
4. x402 Bazaar: `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`
   with `{"resource":"https://tinylemon.xyz/api/on-model","method":"POST"}`,
   then make one paid x402 call so the CDP facilitator indexes the route.
5. Register on <https://www.mppscan.com/register> and
   <https://www.x402scan.com/resources/register>; AgentCash reads the same
   `/openapi.json`.
