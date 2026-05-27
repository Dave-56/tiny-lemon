# Freelancer Feedback Implementation Tasks

Use this checklist to turn the early tester feedback into concrete Tiny Lemon app improvements.

## Current State To Preserve

- Free plan limit is already 50 generations/month in `app/lib/billing.server.ts`.
- All app plans already receive the full image set: front, three-quarter, and back.
- Old front-only brand-style records should not trap users into one image; regression coverage exists in `app/lib/triggerGeneration.server.test.ts`.
- The schema already supports `betaAccess`, `betaStatus`, and `betaCap` on `Shop`, but there is no polished admin/user workflow for granting or explaining special tester access.

## P0: Improve Shopify Publish Confidence

Goal: after publishing, merchants should know exactly what happened and where to verify it.

- [ ] Inspect the current publish flow in `app/routes/app.outfits.tsx` and `trigger/sync-outfit-to-shopify.task.ts`.
- [ ] Confirm whether publishing to an existing Shopify product appends generated media as expected.
- [ ] Confirm whether publishing to an app-created product replaces old app media as expected.
- [ ] Persist more publish details on `Outfit`, such as synced image count and/or returned Shopify media IDs.
- [ ] Update the synced UI state to say something like: `Published 3 images to Shopify`.
- [ ] Keep the `View in Shopify` action visible after success.
- [ ] Add copy for Shopify processing delay, e.g. `Images can take a few seconds to appear in Shopify media.`
- [ ] Add a clear failed state that surfaces the sync error and offers retry.
- [ ] Add tests for success, failure, and partial/no-image sync cases.

Suggested files:

- `app/routes/app.outfits.tsx`
- `trigger/sync-outfit-to-shopify.task.ts`
- `app/test/app.outfits.test.ts`
- `app/test/sync-outfit-to-shopify.task.test.ts`
- `prisma/schema.prisma` if new persisted fields are needed

## P1: Clarify Trial And Tester Access

Goal: avoid confusing “3 generations was too low” feedback while not overbuilding pricing infrastructure.

Important: do not build full regional pricing yet. The app already has a 50-generation free cap and beta cap fields. The missing piece is a clear operational workflow.

- [ ] Confirm production free plan cap is 50 and reflected in billing UI.
- [ ] Confirm beta users can receive a custom `betaCap`.
- [ ] Add or document a simple internal way to grant tester access, such as a script that sets `betaAccess=true`, `betaStatus="active"`, and `betaCap=100`.
- [ ] Add a short note in the beta/billing UI explaining that early testers can request more room if they hit the cap.
- [ ] Track tester country/region and willingness-to-pay feedback manually before changing global prices.

Suggested files:

- `app/lib/billing.server.ts`
- `app/routes/app.billing.tsx`
- `app/routes/app.beta-welcome.tsx`
- `prisma/schema.prisma`
- optional new script under `scripts/`

## P1: Make Custom Model Value More Obvious

Goal: lean into the strongest positive signal: model customization and brand control.

- [ ] Review onboarding and generation screens for where custom model creation appears.
- [ ] Add stronger “your brand model” language in onboarding or the main app.
- [ ] On the Dress Model screen, make the empty custom-model state point users toward creating a model.
- [ ] Consider a post-onboarding prompt that nudges users to create or choose a brand model before generating.
- [ ] Update listing/landing copy to emphasize consistent brand models, not just generic AI images.

Suggested files:

- `app/routes/app.onboarding.tsx`
- `app/routes/app.dress-model.tsx`
- `app/routes/app.model-builder.tsx`
- `docs/SHOPIFY-APP-LISTING-COPY.md`
- `app/routes/_index/route.tsx`

## P2: Create A Short Onboarding / Listing Video

Goal: show the core value in under 60-90 seconds.

- [ ] Script the video around one merchant workflow:
  - upload flat-lay
  - choose or customize model
  - generate front, three-quarter, and back
  - publish to Shopify
  - view the finished Shopify product media
- [ ] Avoid showing every advanced feature.
- [ ] Capture footage from the real app, not a mock landing page.
- [ ] Reuse the video for Shopify App Store, landing page, and onboarding.

Suggested docs:

- `docs/SHOPIFY-APP-LISTING-COPY.md`
- `docs/SHOPIFY-APP-APPROVAL-TRACKER.md`

## P2: Follow Up With Tester

Goal: separate product value feedback from trial-limit or workflow-confusion feedback.

- [ ] Ask whether publish technically failed or was just hard to verify.
- [ ] Ask whether they saw one image or the full three-view set.
- [ ] Offer extended testing access if the original test was limited.
- [ ] Ask what price would feel reasonable in their market.
- [ ] Ask whether they would keep using Tiny Lemon if the workflow and limits were fixed.

## Recommended First Agent Task

Start with **P0: Improve Shopify Publish Confidence**. It is the most trust-breaking issue and the clearest app UX improvement. The beta/trial cap situation is mostly already improved technically; it mainly needs operational polish and messaging.
