# Upcoming Features

## P0 — Image Upscaling

**Goal:** Let merchants upscale generated images beyond the current 1K output for high-res product pages, zoom, and print.

**Approach:**
- Add an upscale step (on-demand or automatic) using a dedicated super-resolution model (e.g. Real-ESRGAN, Topaz, or provider-native upscaling)
- New Trigger.dev task (`upscale-image`) — takes a GeneratedImage and produces a high-res variant
- Store upscaled variants in Vercel Blob alongside existing AVIF/WebP assets
- Gated to Growth+ plans (no separate credit cost)

**Key considerations:**
- Target output: 2K–4K resolution
- Preserve garment detail fidelity (patterns, logos, stitching)
- Extend asset manifest to track upscaled variants
- UX: one-click upscale from the outfits page, or bulk upscale on Shopify sync

---

## P1 — Short Fashion Video Generation

**Goal:** Generate short silent fashion clips from completed outfit images so beta merchants can test video content for product pages, Reels, and TikTok Shop.

**V1 scope:**
- Beta-only
- 5-second silent MP4
- Generated per outfit
- Uses completed generated outfit images as references
- Manual trigger from the outfits page
- Output stored in Vercel Blob and previewed in-app
- Shopify sync excluded from V1

**Approach:**
- Add a new Trigger.dev task (`generate-video`)
- Use a provider adapter so we can evaluate Replicate and other providers without rewriting app orchestration
- Reuse the existing orchestration + polling pattern from image upscaling

**Key considerations:**
- Garment consistency across frames
- Stable face/body identity
- Support subtle motions only in V1: turn, pose shift, slight walk
- Clear video state when source images are regenerated
- Beta feedback and quality evaluation come before billing or plan packaging

---

## P1 — Billing & Plan Streamline

**Goal:** Reframe billing around "outfits" instead of abstract "generations/credits." The internal metering stays the same — this is a language, UI, and feature-gating pass.

**Changes:**
- Rename "generations" → "outfits" in all user-facing copy (billing page, usage meter, plan cards, emails)
- Tier-gate new features instead of charging separately:
  - Free: 3 outfits/mo, front angle only
  - Starter ($39): 30 outfits/mo, all angles
  - Growth ($99): 100 outfits/mo, all angles + upscaling
  - Scale ($249): 300 outfits/mo, all angles + upscaling + video
- Add `PLAN_FEATURES` map alongside existing `PLAN_LIMITS` and `PLAN_ANGLES` to track which capabilities each tier unlocks
- Update billing page plan cards to list feature access per tier
- Internal billing logic (`reserveGenerations`, `CreditTransaction`) unchanged — just the user-facing layer

**Why not credits:**
- Credits are an internal cost-metering abstraction, not a user-facing concept
- Merchants think in products/outfits, not credits
- Adding credits on top of subscriptions creates cognitive overhead ("how many credits does an upscale cost?")
- Simpler model = less support burden, better conversion
