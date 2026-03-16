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

### 1. Fix onboarding (Already been fixed)
- **Status:** Open
- **Priority:** High
- **Description:** Onboarding flow is broken — needs investigation.

### 2. Regeneration does not work (Already been fixed)
- **Status:** Open
- **Priority:** High
- **Description:** Regeneration feature is non-functional.

### 3. Blobs loading slowly on page load
- **Status:** Done
- **Priority:** Medium
- **Description:** Blob assets load slowly on initial page load.
- **Phase 1 — UI hardening (Done):**
  - Added lazy loading and async decoding to non‑LCP images.
  - Prioritized the first visible image with `fetchpriority="high"` (no `decoding` on LCP).
  - Set explicit `width`/`height`, `aspect-ratio: 2 / 3`, and `display: block` to prevent CLS.
  - Added lightweight error fallback for broken images.
  - Files: `app/routes/app.outfits.tsx`, `app/routes/app.dress-model.tsx`.
- **Phase 2 — Variants, formats, caching (Done):**
  - Pre-generated AVIF/WebP variants (320/640/800) for each pose with immutable, hashed filenames.
  - Frontend renders via `<picture>` + `srcset`/`sizes` with PNG fallback.
  - Set long-lived cache on variants (`max-age=31536000, immutable`); originals short-cached and versioned.
  - Updated helpers in `blob.server.ts` for `Content-Type`, cache headers, and disposition.
  - Files: `trigger/generate-outfit.task.ts`, `trigger/regenerate-outfit.task.ts`, `app/blob.server.ts`, `app/lib/imageVariants.ts`, `app/routes/app.outfits.tsx`, `app/routes/app.dress-model.tsx`.
  - Optional (not yet): add preconnect to Blob host.

### 4. Brand profile data not reaching Gemini
- **Status:** Done
- **Priority:** P0
- **Description:** `brandEnergy` and `primaryCategory` are collected at onboarding and stored in DB, but dropped before reaching Gemini. The impact is partially mitigated because these fields drive the `stylingDirectionId` recommendation during onboarding, and that ID does flow through to the prompt (pose snippets, backdrop, energy cues). But the raw values never reach Gemini for fine-grained tuning beyond what the preset provides.

| What Research Says Matters | What We Collect  | What Reaches Gemini     |
|----------------------------|------------------|-------------------------|
| Brand vibe / energy        | brandEnergy      | LOST (indirect via stylingDirectionId) |
| Product category           | primaryCategory  | LOST (indirect via stylingDirectionId) |
| Price point / market tier  | pricePoint       | Yes (via getProductionQualityCue)      |
| Target audience            | Not collected    | N/A                     |
| Reference brand            | Not collected    | N/A                     |
| Style direction            | stylingDirection | Yes (hardcoded snippet) |

**Root causes:**
1. `triggerGeneration.server.ts:90` — generate path `select: { angleIds: true, pricePoint: true }` drops both fields
2. `triggerGeneration.server.ts:262` — regenerate path has the same broken select
3. Neither `GenerateOutfitPayload` nor `RegenerateOutfitPayload` interfaces include the fields
4. `garmentFidelityPrompt.ts` `buildPromptFromSpec()` has no mapping logic for brandEnergy/primaryCategory → prompt text (only pricePoint has `getProductionQualityCue()`)
5. `app.brand-style.tsx:109` — action upserts only `{ angleIds, stylingDirectionId }`, silently dropping `brandEnergy`, `primaryCategory`, AND `pricePoint`. Post-onboarding brand edits wipe pricePoint to null, killing the production quality cue for all subsequent generations.

**Implementation plan (5 steps):**
- [x] **Step 1 — Fix brand-style action** (`app/routes/app.brand-style.tsx`): Persist `brandEnergy`, `primaryCategory`, `pricePoint` on upsert. This is the most severe sub-bug — it actively destroys existing data.
- [x] **Step 2 — Fix both Prisma selects** (`app/lib/triggerGeneration.server.ts`): Add `brandEnergy`, `primaryCategory` to the select at lines ~90 and ~262. Pass them in both task payloads.
- [x] **Step 3 — Update payload interfaces** (`trigger/generate-outfit.task.ts`, `trigger/regenerate-outfit.task.ts`): Add `brandEnergy?` and `primaryCategory?` to both interfaces. Thread them through to prompt construction.
- [x] **Step 4 — Write prompt mapping logic** (`app/lib/brandProfileMapping.ts`): Create `getBrandEnergyCue(brandEnergy)` and `getCategoryContext(primaryCategory)` functions analogous to `getProductionQualityCue(pricePoint)`. **This is the biggest piece of work** — requires designing how each brand energy and category value translates to prompt language that meaningfully differentiates output beyond what the styling direction preset already provides.
- [x] **Step 5 — Integrate into prompt** (`app/lib/garmentFidelityPrompt.ts`): Accept new params in `buildPromptFromSpec()`, inject the cues into the Gemini prompt.

### 5. False "Likely to fail" warning on valid flat lay uploads
- **Status:** Done (Option A shipped; Option C queued)
- **Priority:** High
- **Description:** Uploading a valid single-garment flat lay (front or back) triggers the warning "Likely to fail. Use a single garment image, no extra items" even though the image is valid. The validation logic is too aggressive — likely flagging images that are fine. This blocks the user flow and erodes trust in the upload experience.
- **Fix (Option A):** Relaxed thresholds (brightness 0.4→0.30, corners 0.15→0.20, ratio 1.3→1.6, fail score 3→4). Fixed misleading copy — warnings now describe actual issue (dark/busy) instead of claiming "extra items".
- **Follow-up (Option C):** Replace pixel heuristics with Gemini text-only garment count validation via `POST /api/validate-flatlay`.

### 6. Generation time too slow (~2m 10s)
- **Status:** Done
- **Priority:** High
- **Description:** A single outfit generation takes ~2m 10s (observed: `run_cmmtggwsy5ev20olrrhoufjdz.1`). This doesn't even include the time for the request to reach Trigger.dev from the app.
- **Root cause:** 4 sequential Gemini image gen calls (clean → front → 3/4 → back) plus ThinkingLevel.HIGH on all 3 pose generations.
- **Fix:** Parallelized 3/4 + back poses + switched ThinkingLevel from HIGH to MINIMAL. Gen pipeline: 2m 10s → 1m 12s (45% reduction). Regen pipeline: → 37.6s. No quality regression confirmed on multiple garments.
- **Optimizations applied:**
  - [x] **Parallelize 3/4 + back poses** — Wrapped in `Promise.all` in both task files. Added `generating_poses` status to frontend.
  - [x] **Lower ThinkingLevel to MINIMAL** — Quality verified on sweater + satin dress. Poses correct, garment fidelity maintained.
- **Future (if needed):**
  - [ ] **Remove/relax pose validation** — `validatePose()` adds ~2-4s on happy path; on failure triggers a full retry (+25-35s).
  - [ ] Measure app → Trigger.dev latency separately

### 7. Gender lock + follow-ups (post-MVP)
- Status: Planned
- Priority: High (lightweight)
- Description: We added a zero-latency prompt gender lock for Male/Female. Track small follow-ups and guardrails.
- Tasks:
  - [ ] Normalize gender inputs: use `normalizeModelGender()` at task entry points to avoid stray values (treat only literal 'Male' | 'Female' as locked).
  - [ ] Observability: add a debug log when `genderLock` is applied (pose + gender) to help triage if issues surface.
  - [ ] Scripts parity: ensure preview/generation scripts pass `modelGender` so the lock is effective in tooling.
  - [ ] Resume edge: when resuming a partially completed job that already has a front image, consider warning if lock would have applied but front was generated pre-lock (non-blocking).
  - [ ] Documentation: note gender-lock behavior in developer docs so future prompt edits keep the insertion points intact.

### 8. Regenerate blob overwrite (collision risk)
- Status: Open
- Priority: Medium
- Description: Regeneration uploads use fixed keys like `.../regenerate-front.png`, which can collide on retries or rapid successive regens.
- Tasks:
  - [ ] Switch to versioned filenames (e.g., `regenerate-front-v2.png`) or timestamps.
  - [ ] Alternatively, use an explicit overwrite flag where intended and ensure CDN invalidation if needed.

### 9. Optional validator (fast follow, only if needed)
- Status: Deferred
- Priority: Medium
- Description: If gender slips are observed in production, add a thumbnail validator with one retry, pipelined with cropping to minimize latency.
- Tasks:
  - [ ] Add `validateGender()` (Gemini 2.0 Flash, temp 0, yes/no; trim/lowercase; return true on error) to both generate/regenerate tasks.
  - [ ] Validate/crop pipeline: create 256x384 JPEG Q70 for validation; run crop in parallel; upload only after pass/retry decision.
  - [ ] Gate strictly for 'Male' | 'Female'; keep non-fatal `console.warn` after second miss.
  - [ ] Per-run toggle: wire through request body (no env var) if you want runtime control; default off.
---
