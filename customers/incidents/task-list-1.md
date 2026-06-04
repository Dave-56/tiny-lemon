# Incident Task List 1: Gemini Generation Failures and Credit Counting

Customer report:

> Tried the free tier successfully earlier, but output quality dropped, product graphics were altered, and repeated attempts showed "AI image generation is temporarily at capacity. Please try again in a few minutes." No output was generated, but generations were still counted.

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

- [ ] Detect logos, text, numbers, prints, and typography-heavy garments from the raw upload before flat-lay cleanup.
- [ ] Store a `graphicCritical` signal, plus any extracted description of the graphic, so generation can branch intentionally.
- [ ] For graphic-critical garments, avoid generative flat-lay cleanup when the original upload is already clean enough; use deterministic normalization/background handling instead.
- [ ] Preserve both the raw garment reference and the cleaned/normalized flat lay so the model can still see the original graphic details.
- [ ] Extract a close-up crop of the important logo/print area from the raw garment image.
- [ ] Pass the close-up graphic crop as an additional reference image during front, three-quarter, and back generation.
- [ ] Use stricter graphic-fidelity prompt instructions only on the graphic-critical path, including exact placement, scale, color, spacing, and legibility.
- [ ] Add post-generation validation for visible graphic/text preservation using OCR and/or image similarity against the reference crop.
- [ ] If validation fails, retry once with the stricter graphic-critical inputs; if it still fails, mark the attempt failed/refunded rather than counting an unusable generation.
- [ ] Ask the customer for the video/sample garment so we can compare raw upload, cleaned flat lay, and generated output to identify where fidelity is lost.

## 7. Monitoring and Alerting

- [ ] Add provider outage monitoring for Gemini failures.
- [ ] Track failures by stage: cleanup, garment spec, front, three-quarter, back.
- [ ] Track refunded vs non-refunded failed generations.
- [ ] Add visibility for failed generations that produced no output.

## 8. Customer Follow-Up

- [ ] Follow up with the customer once credits are corrected.
- [ ] Explain that the failure came from Gemini image generation and should not have counted.
- [ ] Ask for the video/sample garment to investigate the graphic-quality regression.

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
