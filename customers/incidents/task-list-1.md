# Incident Task List 1: Gemini Generation Failures and Credit Counting

Customer report:

> Tried the free tier successfully earlier, but output quality dropped, product graphics were altered, and repeated attempts showed "AI image generation is temporarily at capacity. Please try again in a few minutes." No output was generated, but generations were still counted.

Latest customer report, 2026-06-04:

> I can't confirm however whether I got those generations back as I am unable to access the app, it keeps saying "Unexpected Server Error".
>
> I am launching a new clothing brand and being budget conscious, I am trying the AI model option. So far it works quite well, my biggest concern was consistency, and your product clearly does it right. However, two big downsides: the first is not being able to prompt the image before generating, so to choose the rest of the outfit, etc. And the second is not being able select different pose styles. Another one is not being able to regenerate only one of the images, rather than the 4 of them, it seems unnecessary and a bit "wasteful".
>
> I think the product overall is great, but still needs a bit more work to avoid so many regenerations and odd prompting where you're not sure how it will be applied across the 3 model pics.

Trigger.dev error:

```txt
AI image generation is temporarily at capacity. Please try again in a few minutes.
Error: AI image generation is temporarily at capacity. Please try again in a few minutes.
    at generateImageContent (file:///trigger/regenerate-outfit.task.ts:80:11)
```

## 1. Diagnose Gemini Failure Type

- [x] Confirm the exact Gemini failure type before mapping it to customer-facing copy.
- [x] Log raw Gemini error code/status for each failing image call.
- [x] Separate quota exhaustion, rate limiting, billing/credit, safety, and true temporary capacity errors in logs.
- [x] Add structured logs around each Gemini stage: cleanup, garment spec, front, three-quarter, back, and pose validation retry.

## 2. Credits and Refunds

- [x] Ensure Gemini provider-capacity/quota/rate-limit failures refund reserved generations.
- [x] Confirm refund behavior works for both `generate-outfit` and `regenerate-outfit`.
- [ ] Deploy the existing provider-capacity refund logic if it is not already live.
- [x] Identify affected customer attempts and manually refund or regrant lost generations.

## 3. Usage Counting and UI Refresh

- [x] Make monthly usage calculate net usage from `usage` and `refund` transactions.
- [x] Confirm the app nav, Billing page, and Dress Model page all show the same net usage.
- [x] Add tests proving refunded generations reduce displayed monthly usage.
- [ ] Refresh or revalidate usage after a failed/refunded generation so the UI does not show stale counts.
- [x] Re-enable default beta enrollment on app entry and set the default beta allowance to 100 generations for new installs/testers.

## 4. Retry, Queue, and Throttling

- [ ] Review Trigger.dev retry policy for Gemini image tasks.
- [ ] Avoid full multi-step pipeline retries when Gemini is clearly quota-blocked.
- [ ] Add per-attempt retry telemetry so we can tell whether retries help or only delay failure.
- [ ] Review `queue.concurrencyLimit: 3` for image generation tasks.
- [ ] Add app-level or shop-level throttling for generation requests.
- [ ] Consider disabling parallel batch firing from the Dress Model UI during provider pressure.
- [ ] Add provider-health/backoff behavior when Gemini repeatedly returns quota or rate-limit errors.

## 5. Customer-Facing Error Experience

- [ ] Improve customer-facing error copy so one generic "temporarily at capacity" message is not used for every Gemini failure.
- [ ] For refunded provider failures, show a message like: "This attempt failed and was not counted."
- [ ] Alert internally if the provider error is caused by app billing/API quota configuration.

## 6. Product Graphic and Logo Fidelity

Implement a graphic-critical generation path for garments with visible logos, text, numbers, typography, or large prints. The goal is not to replace the normal pipeline for every garment, but to protect graphic-heavy products from being softened, redrawn, or invented during cleanup and model generation.

- [x] Detect logos, text, numbers, prints, and typography-heavy garments from the raw upload before flat-lay cleanup.
- [x] Store a `graphicCritical` signal, plus any extracted description of the graphic, so generation can branch intentionally.
- [x] For graphic-critical garments, avoid generative flat-lay cleanup when the original upload is already clean enough; use deterministic normalization/background handling instead.
- [x] Preserve both the raw garment reference and the cleaned/normalized flat lay so the model can still see the original graphic details.
- [x] Extract a close-up crop of the important logo/print area from the raw garment image.
- [x] Pass the close-up graphic crop as an additional reference image during front, three-quarter, and back generation.
- [x] Use stricter graphic-fidelity prompt instructions only on the graphic-critical path, including exact placement, scale, color, spacing, and legibility.
- [x] Add post-generation validation for visible graphic/text preservation using OCR and/or image similarity against the reference crop.
- [x] If validation fails, retry once with the stricter graphic-critical inputs; if it still fails, mark the attempt failed/refunded rather than counting an unusable generation.
- [ ] Ask the customer for the video/sample garment so we can compare raw upload, cleaned flat lay, and generated output to identify where fidelity is lost.

## 7. Monitoring and Alerting

- [ ] Add provider outage monitoring for Gemini failures.
- [ ] Track failures by stage: cleanup, garment spec, front, three-quarter, back.
- [ ] Track refunded vs non-refunded failed generations.
- [ ] Add visibility for failed generations that produced no output.

## 8. Customer Follow-Up

- [x] Follow up with the customer once credits are corrected.
- [x] Explain that the failure came from Gemini image generation and should not have counted.
- [x] Ask for the video/sample garment to investigate the graphic-quality regression.

## 9. Blob Collision, Error Sanitization, and No-Output Refunds

Context:

- Retries or regenerations can fail if Vercel Blob already contains an app-owned deterministic path.
- Some Blob collisions happen before Trigger.dev receives a run, during the app server's raw image upload step.
- Internal storage/provider errors should stay in Trigger.dev/Vercel logs, not in merchant-facing polling responses or UI.
- If Gemini produces an image but Blob save fails, the merchant still receives no usable output, so the failed attempt should be treated like a no-output internal failure.

Tasks:

- [x] Update the Blob upload helper to use `allowOverwrite: true` for deterministic app-owned paths, or move risky writes to unique versioned filenames.
- [x] Confirm safe overwrite paths for raw input uploads, clean flat-lay uploads, and generated image variants with content hashes.
- [x] Add `getUserFacingGenerationError(error)` or equivalent sanitization for generation failures.
- [x] Keep raw internal errors in Trigger.dev/Vercel logs, but store only friendly copy in `Outfit.errorMessage`.
- [x] Add structured failure metadata where practical, such as `errorKind`, `stage`, and `refunded`.
- [x] Map Vercel Blob/storage failures to friendly copy like: "We hit a storage issue while saving your image. Please try again."
- [x] Map provider/internal generation failures to friendly copy like: "Image generation failed. Please try again."
- [x] For refunded no-output failures, show: "This attempt failed and was not counted."
- [x] Refund final failures for known no-output storage failures, including Blob upload/save failures after image generation.
- [x] Sanitize and refund pre-enqueue raw Blob upload failures before a Trigger.dev run exists.
- [x] Ensure polling APIs and failed-state UI never expose raw Blob errors, stack traces, provider internals, or signed/internal URLs.
- [x] Refresh or revalidate usage after a refunded storage/provider failure so the usage meter reflects the refund.
- [x] Add tests proving duplicate Blob uploads no longer fail.
- [x] Add tests proving raw Vercel Blob errors never reach polling API/UI.
- [x] Add tests proving refunds happen for provider-capacity failures and no-output storage failures.
- [x] Add tests proving displayed usage is refreshed or netted after refund.

Implementation note:

- The Blob collision happened because retries can run the same generation step again with the same app-owned filename, such as a raw upload, cleaned flat lay, or content-hashed image variant. Vercel Blob does not overwrite an existing path by default, so a retry could fail even though replacing that deterministic generated asset is safe. If the collision happens while saving the raw upload, the request can fail before Trigger.dev receives a run.

## 10. App Access: Unexpected Server Error

Context:

- Customer cannot verify whether refunded generations are visible because the app shell now shows "Unexpected Server Error".
- This is a blocking access incident, separate from the generation-quality/refund issue.
- Likely surfaces through a route loader, app-shell loader, auth/session path, billing lookup, onboarding redirect, or data migration mismatch.
- Local Shopify dev must never mutate the production app URLs while customers are on prod. The production Shopify config had `automatically_update_urls_on_dev = true`, which can point the live app at a local tunnel if `shopify app dev` is run against the prod app config.

Tasks:

- [ ] Capture affected shop domain, app URL/path, timestamp, browser, and whether it happens inside Shopify admin embedded mode.
- [ ] Pull production logs for the failed request and identify the exact route/loader/action throwing.
- [x] Set production `shopify.app.toml` to `automatically_update_urls_on_dev = false`.
- [x] Create a separate dev Shopify app config before running local embedded-app dev again.
- [ ] Use a separate dev Shopify app, dev store, dev database, and Trigger.dev dev keys for local testing.
- [ ] Check whether the failure happens before or after `authenticate.admin(request)`.
- [ ] Verify the app shell loader handles missing `Shop`, missing `BrandStyle`, missing beta fields, and stale sessions without throwing.
- [ ] Add structured route-error logging with `shop`, route path, request id, and sanitized error kind so future "Unexpected Server Error" reports are actionable.
- [ ] Add a merchant-safe app error screen or fallback copy with support contact instead of a generic crash when recovery is possible.
- [ ] Confirm the affected merchant can access `/app/dress-model`, `/app/outfits`, and `/app/billing` after the fix.
- [ ] Follow up with the customer once access is restored and confirm whether the refunded generations are reflected.

## 11. Generation Control Feedback: Prompt, Pose Styles, and Single-Image Regeneration

Context:

- Positive signal: the customer specifically says consistency is the main concern and Tiny Lemon does that well.
- Main friction: they cannot guide the outfit/styling before first generation.
- Main control gap: they cannot pick different pose styles.
- Main waste concern: regenerating the whole set when only one image needs improvement feels unnecessary.
- Prompt clarity gap: merchants are not sure whether custom instructions apply to one image, all three model images, styling only, or the actual product details.

Tasks:

- [ ] Add an optional pre-generation direction field on Dress Model for outfit/styling instructions, separate from SKU name.
- [ ] Make the UI clear that the pre-generation direction applies across the full generated set so front, three-quarter, and back stay consistent.
- [ ] Pass pre-generation user direction through `handleTriggerGeneration`, `generate-outfit`, and prompt construction.
- [ ] Add focused tests proving pre-generation direction is persisted in the outfit and reaches the generation task payload.
- [ ] Add optional pre-generation style notes so users can specify outfit/styling direction before the first generation, such as bottoms, shoes, accessories, background, or mood.
- [ ] Define a small v1 pose-style taxonomy, such as neutral studio, hands relaxed, slight contrapposto, editorial, and side-profile-adjacent.
- [ ] Add pose-style selection to the generation UI without reintroducing confusing plan-based angle controls.
- [ ] Thread pose-style selection into prompt construction for each generated angle.
- [ ] Add tests proving selected pose style changes prompt text while preserving required front/three-quarter/back angle constraints.
- [ ] Add image-level regenerate actions for each output image: Front, Three-quarter, Back, and Flat lay where applicable.
- [ ] Pass scoped regenerate targets through the client/API/task payload, such as `targetPoses: ["front"]`, so regenerating one pose does not touch the others.
- [ ] Design single-image regeneration in Outfits for one pose at a time: front, three-quarter, back, or any future fourth image.
- [ ] Update regenerate persistence so untouched generated images are preserved and only selected target poses are replaced.
- [ ] Decide credit behavior for single-image regeneration so merchants are not charged like a full outfit set.
- [ ] Ensure single-image regeneration replaces only the selected `GeneratedImage` row and leaves the other pose images intact.
- [ ] Apply user custom instructions only to the selected target pose(s), not globally to every generated image.
- [ ] Default custom instructions to product preservation: keep garment color, graphics, text, fit, model identity, and non-target poses unchanged unless explicitly requested.
- [ ] Add a prompt intent normalizer that converts user text into a safe structured regeneration intent: target image(s), edit subject, normalized instruction, preservation rules, risk level, and whether clarification is needed.
- [ ] Avoid a chatty back-and-forth; only ask for confirmation when the instruction could change the actual product, remove/alter graphics, alter model identity, or otherwise destroy accuracy.
- [ ] Add a small UI scope summary before submit or in the regenerate modal, such as "Applies to: Front only - Product details preserved."
- [ ] If an outfit is already synced to Shopify, mark Shopify sync stale after a single-image regeneration.
- [ ] Preserve existing video behavior intentionally: either clear stale video on source-image change or label it as based on the previous image set.
- [ ] Add tests for single-pose regeneration success, failure, refund/credit behavior, and stale Shopify sync marking.
- [ ] Add tests proving vague background/lighting instructions preserve garment graphics and product details by default.
- [ ] Update customer follow-up copy to acknowledge all three product asks and share which are planned vs already available.

## 12. Beta Access and Launch Allowance

Context:

- Launch/tester installs should be treated as beta participants, not plain free-plan users.
- Beta users should receive a 100-generation monthly allowance while we learn from early merchants.
- Older default-beta records may still carry the previous 50-generation cap and should be lifted to the current default unless a manual/custom cap was intentionally set.

Tasks:

- [x] Rewire app entry to call `ensureBetaAccessForShop(session.shop)` so app installs/entries receive beta access automatically.
- [x] Set `BETA_DEFAULT_CAP` to 100 generations.
- [x] Update default-beta cap handling so existing default-beta shops move to the current default while manual custom caps are preserved.
- [x] Run focused billing tests and typecheck after the beta allowance change.

## 13. Unsatisfactory Output Credit Policy

Context:

- Current refund logic covers known no-output provider/storage failures and validation failures that are explicitly marked failed/refunded.
- If the app successfully produces output but the merchant dislikes the quality, styling, pose, graphic fidelity, or usefulness, the attempt currently still counts.
- We need a product and abuse-resistant engineering policy for when a generated-but-unsatisfactory result should not count toward the merchant's monthly allowance.

Tasks:

- [ ] Define what qualifies as a "bad output" refund versus normal creative preference.
- [ ] Decide whether refunds should be merchant self-serve, support-reviewed, automatically triggered by validation, or some combination.
- [ ] Consider a "report issue / do not count this result" flow on generated outfits.
- [ ] Add guardrails so merchants cannot repeatedly keep usable outputs while refunding every attempt.
- [ ] Decide whether refunded unsatisfactory outputs should be hidden, watermarked, deleted, excluded from downloads, or left visible for debugging.
- [ ] Track refund reason separately from provider failures, such as `merchant_quality_dispute`, `graphic_fidelity_failure`, or `pose_style_mismatch`.
- [ ] Add analytics and admin visibility for quality-refund requests, approvals, denials, and repeat patterns.
- [ ] Update customer-facing copy so merchants understand when failed or unusable attempts are not counted.

## 14. Video Generation Credit Counting

Context:

- Product videos are provider-costly and should not be free/unmetered during beta or paid usage.
- Video generation and video regeneration should each count as 1 generation credit when a fresh video attempt is accepted.
- No-op/idempotent states, such as already in progress or already completed, should not double-charge.
- Failed no-output video attempts should be refunded, matching the image generation policy.

Tasks:

- [x] Reserve 1 generation credit for fresh video generation and video regeneration requests.
- [x] Do not reserve credits for invalid outfits, missing access, already-in-progress videos, or already-completed videos.
- [x] Refund video credits if Trigger.dev enqueue fails before the video task is accepted.
- [x] Pass credit reservation metadata into `generate-video`.
- [x] Refund video credits on final video task failure and stale-abort no-output cases.
- [x] Add focused tests for video charging, limit exhaustion, enqueue refund, final failure refund, and stale-abort refund.

## 15. Deployment, Backfill, and Support Operations

Context:

- Code changes only affect production once deployed, and existing database rows can have older entitlement state.
- Launch/tester shops should have beta access immediately, not only after they next enter the app.
- Merchants and support need clear visibility into what counts, what is refunded, and how credits can be corrected.

Tasks:

- [x] Audit existing `Shop` rows for plan, beta access, beta status, beta cap, and grant source.
- [x] Backfill existing real shops to beta access while preserving paused/ended exclusions, manual grant labels, and paid-plan minimum allowances.
- [x] Keep `__demo__` excluded from the beta backfill.
- [x] Add entitlement guard so beta access cannot reduce a paid plan allowance such as Scale.
- [ ] After deploy, verify production behavior for new install beta access, 100-generation beta allowance, video credit charging, and failed-attempt refunds.
- [ ] Add merchant-facing copy for credit rules: video uses 1 generation, failed no-output attempts are not counted, and beta allowance is 100/month.
- [ ] Add internal support/admin visibility for shop usage, refund transactions, beta status, beta cap, and grant source.
- [ ] Add a safe support action or script for regranting/refunding credits without direct manual SQL.
- [ ] Document the support policy for when to manually refund provider failures, video failures, and unsatisfactory-output disputes.
