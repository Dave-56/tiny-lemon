# Freelancer Feedback Action Plan

**Date:** 2026-05-21  
**Source:** Early paid tester / Shopify fashion merchant operator  
**Context:** Tester was expected to use the app for about one week, but asked for payment after roughly two days. The likely reasons are that the current free trial limits constrained meaningful testing and old pose-setting behavior may have limited him to one image instead of the intended three-view set.

---

## Executive Summary

The feedback is encouraging but exposes a few launch-blocking issues. The tester liked the core product value, especially the ability to customize the model, but hit friction around Shopify publishing visibility, trial limits, possible one-image generation behavior, and pricing fit for his region.

The most important signal is that the product value is real, but the testing window may have been artificially shortened by the free trial cap and incomplete multi-angle output. We should not treat this as a completed validation cycle yet. We should offer a partial milestone release for the install and early feedback, extend his access, ask sharper follow-up questions, and use the feedback to shape the next product sprint.

---

## Feedback Captured

### 1. Shopify Publishing Visibility

**Feedback:** After publishing to Shopify, the tester could not clearly see his generated images.

**Why it matters:** This is a trust-breaking workflow issue. If the app says it published to Shopify but the merchant cannot find or confirm the generated assets, the user may assume the app failed.

**Likely product need:** A clearer post-publish confirmation flow that shows exactly where the images went.

### 2. Free Trial Cap Is Too Low

**Feedback:** The previous free trial cap of 3 generations felt too low.

**Why it matters:** Three generations was not enough for a merchant to evaluate output quality, retry bad inputs, compare angles, test real products, and decide whether the app is worth keeping.

**Current risk:** Early testers may stop testing before they experience the product deeply enough to give useful retention or willingness-to-pay feedback.

### 3. Only One Generated Image Instead Of A Multi-Pose Set

**Feedback / observed issue:** The tester appears to have generated only one image, when an outfit should normally produce multiple views such as front, three-quarter, and back.

**Why it matters:** One image is not enough to evaluate the real product promise. Merchants need to see whether Tiny Lemon can create a usable product media set, not just a single hero shot.

**Likely product need:** During testing, remove tier/pose-selection complexity and generate the full three-view set for every app user.

### 4. Pricing Feels Expensive In Some Regions

**Feedback:** Pricing felt expensive for the tester's region, likely because he is based in Nigeria.

**Why it matters:** A globally flat USD price can make the app feel inaccessible in lower purchasing-power markets, even when the product is useful.

**Important nuance:** We should not immediately reduce global pricing based on one user. Instead, use this as a prompt to test regional pricing, launch discounts, or manual discount codes.

### 5. Model Customization Is A Strong Positive Signal

**Feedback:** The tester loved the model customization experience.

**Why it matters:** This is a high-conviction product signal. The ability to customize the model may be one of Tiny Lemon's strongest differentiators versus generic AI image generation tools.

**Product implication:** We should make custom models more visible in onboarding, app store screenshots, examples, and product copy.

### 6. Onboarding Video Would Help

**Feedback / founder reflection:** We should create a short onboarding or listing video that shows how the app works.

**Why it matters:** The app's value is visual and workflow-based. A short click-through video can reduce confusion and improve Shopify App Store conversion.

**Important scope:** The video should show the core journey, not every feature.

### 7. Testing May Have Ended Early Because Of Limits

**Feedback / founder reflection:** The tester was asked to test for a week but asked for payment after roughly two days.

**Why it matters:** This may not mean he fully evaluated the app. He may have simply run out of free trial capacity or enough useful actions to continue.

**Action needed:** Follow up, offer a half-payment release now if needed, and offer extended or free access in exchange for deeper, honest feedback after at least a week of testing.

### 8. Name / Positioning May Need To Be Clearer

**Feedback:** Consider whether "Tiny Lemon" clearly communicates what the product does.

**Why it matters:** The product is really about helping fashion brands create hyper-realistic, stylish models wearing their clothes, so they can improve Shopify product presentation and potentially increase conversion. The name and positioning should make that value obvious faster.

**Action needed:** Explore whether the name, tagline, or app listing copy should more directly communicate "AI models for fashion product photos" and "put your clothes on realistic models."

---

## Recommended Priorities

### P0: Fix Shopify Publish Confidence

**Goal:** After publishing, merchants should always know what happened and where to verify it.

**Actions:**

- Confirm whether generated images are actually attaching to the intended Shopify product.
- Add or improve a post-publish success state.
- Show product title, image count, and direct link to the Shopify product/admin destination where possible.
- Add clear error states if publish partially fails.
- Add logging around publish attempts, product IDs, image IDs, and response status.

**Success criteria:**

- A merchant can publish generated images and immediately verify the result.
- Support/debugging can answer whether a publish succeeded, failed, or partially succeeded.

### P0: Make Multi-Pose Generation Universal During Testing

**Goal:** Every app user should receive the full intended pose set during testing: front, three-quarter, and back.

**Actions:**

- Give all plans the full three-view entitlement during testing.
- Ignore old saved front-only brand-style records when deciding what poses to generate.
- Save the full effective pose set during onboarding and brand-style updates.
- Remove the pose selector from the brand-style screen for now.
- Add regression tests around old front-only records.

**Success criteria:**

- A tester generating an outfit receives front, three-quarter, and back views.
- Existing stores that were accidentally saved as front-only are not stuck with one output.
- The app no longer asks early users to understand plan-based pose tiers.

### P1: Increase Or Redesign The Free Trial

**Goal:** Let users experience enough value before deciding whether to pay.

**Possible experiments:**

- Increase the free trial from 3 generations to 50 generations during launch/testing.
- Offer a "first product free" trial where the user can fully generate one useful product set.
- Give early testers a temporary unlimited or high-credit trial.
- Separate image and video credits if video generation consumes value differently.

**Recommended immediate move:** Give this tester extended/free access and ask him to continue testing with real products.

**Success criteria:**

- Testers use the app for the intended full trial window.
- Users generate enough outputs to evaluate quality, consistency, and store workflow.
- Feedback shifts from "I ran out" to "I would/would not use this because..."

### P1: Validate Regional Pricing Before Global Price Cuts

**Goal:** Understand whether price is the blocker, and what price feels fair in different regions.

**Actions:**

- Ask the tester what monthly price would feel like a no-brainer for merchants in his market.
- Offer him a manual regional/early-tester discount.
- Consider regional launch codes before building full localized pricing infrastructure.
- Track feedback by country/region from future testers.

**Possible pricing tests:**

| Segment | Starter | Pro | Studio |
| --- | ---: | ---: | ---: |
| Global launch pricing | $9/mo | $19/mo | $39/mo |
| Regional pricing test | $5/mo | $12/mo | $25/mo |
| Early tester offer | Free or heavily discounted | Free or heavily discounted | Custom |

**Decision guardrail:** Do not permanently lower global pricing until we have more signal from multiple users.

### P1: Double Down On Model Customization

**Goal:** Make the strongest loved feature more obvious and valuable.

**Actions:**

- Highlight custom model builder earlier in onboarding.
- Add app listing screenshots or video moments that show customizing a model.
- Add examples that show the same product on different model styles.
- Consider saved model presets for brand consistency.
- Consider "your brand model" language in copy.

**Success criteria:**

- Users understand before installing that Tiny Lemon can create consistent models for their brand.
- Early users mention model customization as a reason to keep using the app.

### P1: Revisit Name And Positioning

**Goal:** Make the product promise obvious before users click into the app.

**Actions:**

- Decide whether "Tiny Lemon" needs a clearer tagline, descriptor, or full name change.
- Test positioning around creating realistic AI fashion models wearing a merchant's clothes.
- Emphasize the business outcome: better Shopify product images that can improve trust and conversion.
- Update app listing copy if the current name/value prop feels too abstract.

### P2: Create A Short Onboarding / App Listing Video

**Goal:** Show the core workflow clearly in under 60-90 seconds.

**Suggested video structure:**

1. Start with a flat-lay product image.
2. Choose or customize a model.
3. Pick styling direction / region / look.
4. Generate front, three-quarter, and back product shots.
5. Publish or attach outputs to Shopify.
6. End on the finished Shopify product page or product media gallery.

**Do not include:**

- Every advanced feature.
- Long explanations.
- Slow setup steps.
- Internal dashboard details that do not help a merchant understand value.

**Success criteria:**

- A merchant can understand the product in one watch.
- The video can be reused on the Shopify App Store listing, landing page, and onboarding.

---

## Follow-Up Message To Tester

```text
Hey, thank you again for testing Tiny Lemon and for the feedback you've sent so far. I really appreciate it.

Just to be transparent, the original agreement was for you to use the app for around 1-2 weeks on your store, so we could understand how it fits into your normal product workflow. Since it has only been a couple of days, I'd prefer for us to keep the test going a little longer before closing the milestone.

That said, I'm happy to release half of the payment now for the install and the feedback you've already shared, then release the remaining half after you've used it for at least a week and sent the final feedback. Let me know if that works for you.

Also, I noticed something on my end that may have affected your test. It looks like the app may have only generated one image for you, when it should normally generate multiple views for an outfit, like front view, side view, and three-quarter view. That seems like a bug, and I'm fixing it now. If that limited your testing, I can extend your access and increase or remove the generation limit so you can try it properly.

The main thing I'm really trying to understand is: do you see yourself continuing to use this for your store if the app works properly and the limits are not an issue?

I'd really appreciate your honest thoughts on that. If yes, what would make you keep using it? If no, what is the main reason? Is it the image quality, the workflow, the pricing, or something else?

If pricing is the issue, what monthly price do you think would feel reasonable for a merchant in Nigeria?

Also, when you tried publishing to Shopify, did it actually fail, or did it publish but it was hard to find the images afterwards?
```

---

## Questions To Answer Next

- Did Shopify publishing fail technically, or was the result just hard to discover?
- Did this tester only receive one generated image because of old front-only pose settings?
- How many generations does a merchant need before they can fairly evaluate the product?
- Should the trial limit be based on generations, products, credits, or time?
- What price points feel realistic in Nigeria and similar markets?
- Can regional discounts be handled manually at launch before building full localized pricing?
- Is custom model creation the main product hook we should lead with?
- Does the name "Tiny Lemon" clearly communicate the product, or do we need clearer naming/positioning?
- What exact footage/screens should be included in the Shopify listing video?

---

## Next Sprint Proposal

### Sprint Goal

Improve early-user activation by making the core workflow more trustworthy, easier to evaluate, and clearer before purchase.

### Suggested Work Items

1. Make multi-pose generation universal during testing.
2. Debug and improve Shopify publish confirmation.
3. Raise or redesign the free trial cap for launch/testing.
4. Add an early-tester discount/free-access path.
5. Update onboarding/app listing emphasis around custom models.
6. Revisit name, tagline, and app listing positioning.
7. Script and record a short onboarding/listing video.
8. Follow up with the tester and capture willingness-to-pay feedback.

---

## Product Bet

Tiny Lemon should lean harder into this promise:

> Create consistent on-model product photos for your fashion store, using a model that actually fits your brand.

The tester's strongest positive reaction was not just "AI images." It was customization and control. That should become a central part of the product, onboarding, and launch story.
