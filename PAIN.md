# PAIN.md — listing Tiny Lemon as a headless merchant

Running log of every step that needed a human, an account, a form, a waitlist,
a minimum, a missing doc, or a rail that could not do what the product needs.
Started 2026-09-03 while adding `POST /api/on-model` ($0.50 per image) to
Stripe MPP, Coinbase x402 Bazaar, and AgentCash. Newest entries at the bottom.

Legend: **[HUMAN]** needs an account/form/decision only a person can do ·
**[RAIL]** the protocol or SDK cannot do what the product needs ·
**[DOC]** documentation gap · **[DESIGN]** a product compromise forced by a rail.

---

## 1. Stripe MPP

- **[HUMAN] No Stripe account material on this machine.** `stripe` CLI is not
  installed, `~/.config/stripe` does not exist, and no repo under `~/dev` carries
  `STRIPE_SECRET_KEY`. The MPP doc needs a sandbox secret key **and** a
  `profile_test_…` Business Profile id (`STRIPE_PROFILE_ID`) created in the
  Dashboard. Until both exist the Stripe SPT (card) method cannot be offered and
  `mppx validate` cannot exercise the Stripe roundtrip.
  → Workaround used: offer MPP over the Tempo testnet rail directly (mppx
  `tempo` method, faucet-funded validator wallet). Stripe method is wired and
  switches on automatically when `STRIPE_SECRET_KEY` + `STRIPE_PROFILE_ID` are set.
- **[HUMAN] Payout address.** Even the non-Stripe MPP rail needs a Tempo
  recipient address and x402 needs a Base address. None exists for the
  business. A throwaway keypair was generated on this laptop for *testnet only*
  (`AGENT_PAYOUT_EVM_ADDRESS` in `.env.local`); it must never receive mainnet
  funds. A real custody decision (Coinbase account, Stripe deposit address, or
  a company wallet) is required before going live.
- **[RAIL] Stripe SPT minimum is $0.50 per charge.** Exactly our price, so
  fine, but it rules out anything cheaper (a $0.10 preview tier, for example)
  on the card rail. Stablecoin rails go down to $0.01.
- **[RAIL] Validator gives the paid response 30 seconds.** `mppx validate`
  (and the mppx client) abort the post-payment request after 30 s
  (`fetchWithTimeout(..., 30_000)` in `cli/validate/payment.js`). Our
  generation takes 45–90 s. A synchronous "pay, wait, receive image" endpoint
  can never pass. **[DESIGN]** the paid call now waits up to `wait` seconds
  (default 20) and returns `202 {status:"processing", statusUrl}` when the image
  is not ready; the status URL is free. The image still arrives, one paid call
  per image, but every agent client has to know to poll.
- **[RAIL] Charge-then-generate means the buyer bears generation failures.**
  MPP settles at credential verification, before the resource is produced.
  If the Trigger job fails after that, the agent paid $0.50 for an error.
  Stripe payments (`pi_…` reference) could be refunded via the Stripe API;
  Tempo on-chain transfers have no refund primitive in mppx. Not built yet;
  failures are logged with the payment reference so they can be reconciled
  by hand.
- **[DESIGN] No payment ledger in the product.** Nothing in the schema stores
  the payment reference next to the outfit. For now the receipt reference is
  logged to stdout (Vercel keeps 7 days) and the outfit name carries
  `agent:<protocol>:<nonce>`. Real reconciliation needs a table.
- **[HUMAN] `MPP_SECRET_KEY` must be added to Vercel.** Challenges are HMAC
  bound; the key was generated locally for validation. Production falls back to
  an HMAC of `SHOPIFY_API_SECRET` if the var is missing, but that couples two
  unrelated secrets — set the real var before launch.
- **[DOC] The Stripe page says "run `npx mppx@latest validate`" but never says
  what it fetches.** It reads `<base>/openapi.json`, needs `x-payment-info` (or a
  `402` response) per operation, and auto-builds a request body from
  `requestBody` `required` fields using their `example` values. Found by reading
  `node_modules/mppx/dist/cli/validate/*.js`, not the docs.

## 2. Coinbase x402 / Bazaar

- **[HUMAN] CDP API key required for mainnet and for Bazaar indexing.**
  The CDP facilitator (`api.cdp.coinbase.com/platform/v2/x402`) needs
  `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` from portal.cdp.coinbase.com. The
  keyless `x402.org/facilitator` only supports testnets (Base Sepolia, Solana
  devnet) and does **not** feed the Bazaar. So: no CDP account → no listing.
- **[RAIL] Bazaar indexes only after a real settlement on public HTTPS.**
  Per the seller docs a route is indexed when (1) it is reachable over HTTPS,
  (2) `POST …/x402/validate` passes, and (3) a paid call settles through the
  CDP facilitator with the `bazaar` extension declared. A preview deployment
  would get indexed under the preview hostname, so this can only be done after
  the branch is merged and deployed to tinylemon.xyz, then paid once from a
  funded Base wallet.
- **[HUMAN] Base Sepolia test USDC has no automatic faucet in the tooling.**
  `mppx validate` auto-funds a Tempo testnet wallet but cannot fund Base
  Sepolia, and the CDP faucet needs a CDP account. The x402 402 challenge is
  verified structurally locally (PAYMENT-REQUIRED decodes, bazaar extension
  present) but an end-to-end x402 payment could not be executed on this
  machine.
- **[DOC] `declareDiscoveryExtension` is not on the Bazaar page.** The
  get-discovered page shows it in a snippet but the exported config shape
  (`bodyType`, `input`, `inputSchema`, `output.{example,schema}`) had to be read
  from `@x402/extensions` type declarations.

## 3. AgentCash

- **[DOC] The merchant page has no code.** `/merchant` and
  `/docs/sell-to-agents` describe three steps and link to the router; the
  concrete contract lives in `/docs/discovery`: serve OpenAPI 3.1 at
  `/openapi.json`, add `x-payment-info.price` + `protocols`, `info.x-guidance`,
  and `responses.402`, then validate with `npx @agentcash/discovery check` and
  register on MPPScan / X402Scan. Ownership proofs (`x-discovery.ownershipProofs`)
  are mentioned with no explanation of how to produce one.
- **[HUMAN] Registration is a web form.** Listing happens at
  `mppscan.com/register` and `x402scan.com/resources/register`; there is no API
  or CLI call to register, so a person must submit the production URL once.

## 4. Found while validating (2026-09-03, local server on :4242)

- **[RAIL] Every `mppx validate` run is a real $0.50 testnet payment *and* a
  real generation.** The validator's roundtrip pays with faucet money but our
  server cannot tell a validator from a customer, so each run enqueues a real
  Trigger.dev job and spends real OpenRouter credit (~1 image). Iterate on the
  discovery doc with `validate(doc)` from `mppx/discovery` offline instead;
  only run the full CLI when the payment path itself changed.
- **[DOC] `x-payment-info` cannot carry `description` next to `offers`.**
  mppx's schema refuses any flat field (`amount`, `currency`, `description`,
  `intent`, `method`) once `offers[]` is present ("Cannot mix offers with flat
  payment info fields"). Not in the Stripe or mpp.dev docs; found in
  `mppx/dist/discovery/Discovery.js`. Unknown keys (AgentCash's `price`,
  `protocols`) are tolerated.
- **[DOC] AgentCash `check` takes the endpoint URL, `discover` takes the
  origin.** `check http://host` answers `L3_NOT_FOUND`; `check http://host/api/on-model`
  works. The docs show `$TARGET_URL` for both.
- **[DOC] AgentCash "auth mode" is inferred from `security: []`.** Free routes
  warn `L2_AUTH_MODE_MISSING` until the operation carries an explicit empty
  `security` array; paid routes are inferred from `x-payment-info`; identity
  routes from a scheme named `siwx` or tagged `x-agentcash-auth-kind: siwx`.
  None of this is documented — read from `@agentcash/discovery/dist/index.js`
  (`inferAuthMode`).
- **[RAIL] `mppx validate` also shells out to `stripe config --list`** on
  every run (`/bin/sh: stripe: command not found` in the log). Harmless, but
  it means the Stripe leg can only ever be exercised on a machine with the
  Stripe CLI logged in or `MPPX_STRIPE_SECRET_KEY` exported.
- **[DESIGN] Realm is per hostname.** Challenges embed `realm`, and the
  validator warns when it differs from the host it called. The server now
  builds one mppx instance per realm (localhost in dev, tinylemon.xyz in
  prod); `MPP_REALM` overrides. `VERCEL_URL` would otherwise leak the
  deployment hostname into production challenges.
- **Result of the first full run:** Tempo testnet payment accepted, on-chain
  receipt `0x98096c5e…`, HTTP 202, job completed ~60 s later with a correct
  on-model image. 25 checks passed; the 2 failures were the discovery-doc
  rule above, fixed.

## 5. AgentCash "publish the discovery spec"

- **[DOC] There is nothing to publish *to*.** `agentcash.dev/merchants.md` is
  a prompt for a coding agent ("answer these four questions…"), not a spec;
  `/onboard` is the *buyer* signup (connect GitHub/Twitter/LinkedIn for up to
  $25 of credit). For providers the whole contract is: serve `/openapi.json`
  with `x-payment-info` + `info.x-guidance`, answer 402 at runtime, and register
  the **origin** on x402scan and MPPScan. AgentCash then crawls it.
  Done here: the document validates with `@agentcash/discovery` (3 routes,
  paid route `0.50 USD [x402, mpp]`, guidance 144 tokens, 0 warnings).
- **[HUMAN] Registration is two web forms on third-party sites, with the
  production URL.** `x402scan.com/resources/register` is a client-side app
  ("Add API") and `mppscan.com/register` likewise; neither exposes an API, and
  a `localhost` origin cannot be submitted. This step waits for the merge and
  deploy to tinylemon.xyz.
- **[DOC] Ownership proofs remain unexplained.** `x-discovery.ownershipProofs`
  is listed as a top-level field on the discovery page, but nothing says what
  is signed or with which key, and the checker never asked for it.
- **Local result:** `mppx validate` → 26 passed / 0 failed / 0 warnings on the
  second run (Tempo testnet receipt `0xcf494c8b…`); AgentCash `discover` and
  `check` clean; x402 challenge decodes with the bazaar declaration.

## 6. AgentCash end-to-end (buyer side), 2026-09-03

- **[RAIL] AgentCash never pays a testnet.** Its wallet holds USDC on Base
  mainnet, Solana mainnet, and Tempo mainnet only. So an end-to-end test of
  "AgentCash pays my endpoint" is always real money, and the one mainnet rail
  we can offer without a third-party account is MPP over Tempo (mppx verifies
  the transfer on the public RPC). Base mainnet x402 still needs the CDP key.
- **[HUMAN] Funding the buyer wallet is a browser flow.** `npx agentcash
  accounts` creates a wallet with no login (`0x876968DE…` on Base + Tempo,
  a Solana address too), but the only free money is the onboarding bonus:
  connect GitHub/Twitter/LinkedIn at agentcash.dev/onboard, get a one-time
  claim code, run `npx agentcash onboard <CODE>`. Otherwise deposit USDC at the
  wallet's deposit link. No CLI-only path.
- **Result so far:** server in mainnet mode issues a Tempo (chainId 4217)
  USDC.e challenge for 500000 units; `agentcash check` reads the schema and
  `requiresPayment: true`; `agentcash fetch … -p mpp --payment-network tempo`
  fails with `INSUFFICIENT_BALANCE: costs 0.5 USDC on tempo, balance 0`. The
  payment itself is untested until the wallet holds ≥ $0.50 on Tempo (or on
  Base, then "bridge between accounts" as the error suggests).
- **[DESIGN] The $0.50 would land on the throwaway key.** With no company
  wallet, a real payment goes to the laptop-generated address in `.env.local`.
  Fine for one test; not a payout setup.

## 7. Stripe CLI and AgentCash funding, 2026-09-03 afternoon

- **[HUMAN][DOC] The Stripe MPP doc's validator auto-detect is dead on the
  current CLI.** `mppx validate` finds the sandbox key by grepping
  `test_mode_api_key` out of `stripe config --list`, but Stripe CLI 1.50 stores
  keys in the OS keychain and the config only carries `account_id` /
  `device_name`. Logging in with the CLI therefore does nothing for MPP: the
  sandbox secret key still has to be copied from the Dashboard into
  `STRIPE_SECRET_KEY` (server) and `MPPX_STRIPE_SECRET_KEY` (validator).
- **[HUMAN] The Business Profile is a Dashboard object.** The doc says "create
  a Stripe profile in the Dashboard" and only shows an API call to *read* it
  (`GET /v2/network/business_profiles/me`, preview API version). No CLI or
  API creation path is documented.
- **[RAIL] AgentCash's own onramp had no liquidity.** The "Add Funds" page
  (debit card → USDC via Stripe) showed "No quotes found" at $5.00, so a buyer
  with a card and no crypto could not fund the wallet at all at that moment.
  The founder was left "waiting on AgentCash to give me money".

## 8. Stripe sandbox leg, 2026-09-03 evening

- **Result:** with `STRIPE_SECRET_KEY` + `STRIPE_PROFILE_ID` (sandbox, pulled
  from Vercel's Development env) the challenge advertises `stripe/charge`
  (card, link) and `mppx validate` pays with `pm_card_visa`: PaymentIntent
  `pi_3UBhEK…` for 50 cents `succeeded`, HTTP 202, job completed with an
  image. 19/19 checks passed.
- **[DOC] `defaultMethods()` silently drops Tempo unless you hand it an
  address.** The Stripe MPP page shows the async form ("Stripe automatically
  offramps…") but in mppx 0.9.2 the Tempo rail is only created when
  `depositAddresses` is a static object or a resolver *function*; with nothing
  passed the sync path returns Stripe-only and logs nothing. First validate run
  therefore had no Tempo offer at all. Fixed by passing
  `depositAddresses: (network) => stripe.findOrCreateDepositAddress(client, network)`
  when `TEMPO_DEPOSIT_ADDRESS` is unset.
- **[HUMAN] Sandbox deposit address had to be created by API.** Stripe's
  sandbox listed no `crypto/deposit_addresses`; `POST …?network=tempo`
  (preview API version) created `0x5ff8d73e…` (USDC on Tempo). Production
  needs the same call against the live key, or the resolver above at boot.
- **[RAIL] Sandbox card charges cost real generations.** Every validator run
  against the Stripe leg enqueues a real Trigger job and spends OpenRouter
  credit, same as the Tempo runs.

