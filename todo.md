# Tiny Lemon — TODO

## Billing
- [x] Define plan constants (`plans.ts`)
- [x] Configure billing in `shopify.server.ts` (Starter $39, Growth $99, Scale $249)
- [x] Billing page UI (`app.billing.tsx`) — usage meter + plan cards
- [x] Usage gating with serializable transaction (`billing.server.ts`)
- [x] Webhook handler for subscription events (`webhooks.app_subscriptions.update.tsx`)
- [x] DB schema — `Shop.plan` + `CreditTransaction` model + migrations
- [x] Set app distribution to Public in Partners Dashboard (required for Billing API)

---

## Bugs

### 1. Fix onboarding
- **Status:** Open
- **Priority:** High
- **Description:** Onboarding flow is broken — needs investigation.

### 2. Regeneration does not work
- **Status:** Open
- **Priority:** High
- **Description:** Regeneration feature is non-functional.

### 3. Blobs loading slowly on page load
- **Status:** Open
- **Priority:** Medium
- **Description:** Blob assets load slowly on initial page load.

### 4. Brand profile data not reaching Gemini
- **Status:** Open
- **Priority:** High
- **Description:** Gap between what we collect in onboarding and what actually reaches Gemini for generation.

| What Research Says Matters | What We Collect  | What Reaches Gemini     |
|----------------------------|------------------|-------------------------|
| Brand vibe / energy        | brandEnergy      | LOST                    |
| Product category           | primaryCategory  | LOST                    |
| Price point / market tier  | Not collected    | N/A                     |
| Target audience            | Not collected    | N/A                     |
| Reference brand            | Not collected    | N/A                     |
| Style direction            | stylingDirection | Yes (hardcoded snippet) |

### 5. Generation time too slow (~2m 10s)
- **Status:** Open
- **Priority:** High
- **Description:** A single outfit generation takes ~2m 10s (observed: `run_cmmtggwsy5ev20olrrhoufjdz.1`). This doesn't even include the time for the request to reach Trigger.dev from the app. Need to investigate where time is spent and find ways to reduce it.
- **Areas to investigate:**
  - [ ] Profile the task — how much time is Gemini API call vs image processing vs upload?
  - [ ] Can we use a faster model or lower quality for initial preview?
  - [ ] Parallel image generation instead of sequential?
  - [ ] Image compression / resize before sending to Gemini?
  - [ ] Reduce round-trips to external services
  - [ ] Measure app → Trigger.dev latency separately

---

## Completed Bugs
_(move items here when done)_
