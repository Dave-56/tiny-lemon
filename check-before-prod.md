# Check Before Prod

Three things that must be done before launch.

---

## 1. Connect custom models to Dress Model [x]

**Status:** Critical disconnect — custom models built in Model Builder are not available in Dress Model.

**Problem:** `app/routes/app.dress-model.tsx` fetches `/preset-models.json` (a static file) for the model picker. Models created via Model Builder are saved to the DB but never queried here. A merchant can build an entire model library and see none of them on the main generation screen.

**Fix:** In the `dress-model` loader, query `prisma.model.findMany({ where: { shopId, isPreset: false } })` and merge the results into the model picker grid alongside preset models.

---

## 2. Input quality validation [x]

**Status:** Missing — bad flat lays silently burn credits.

**Problem:** There is no check on the uploaded flat lay before the generation pipeline runs. A dark, busy, or oddly-cropped image will consume a credit and likely produce a poor result. On the free tier (3 credits), one bad upload can kill the trial experience.

**Fix:** Add client-side validation on upload — check image dimensions, aspect ratio, and basic brightness/contrast. Show a "looks good / might struggle / likely to fail" label per item before the user hits Generate. Do not count safety-filter rejections or clearly invalid inputs against the credit limit.

---

## 3. Batch ZIP export [x]

**Status:** Missing — individual file downloads only.

**Problem:** The current output UI has a per-image download button. For a batch of 10 SKUs with 4 images each, that is 40 individual download clicks. This is not an ops tool; it is a prototype. Merchants running catalog shoots need to walk away with a ZIP.

**Fix:** Add a "Download all" button to the output section that packages all result images into a ZIP with standardized filenames (`{sku-name}-{angle}.png`) and triggers a single browser download.

---

## 4. DB migration — rename `Model.angleId` → `Model.poseId`

**Status:** Pending — low priority, no functional impact, do not rush.

**Problem:** `Model.angleId` is a real persisted column in the DB that records the pose the model reference photo was generated in (always `'front'` currently). The rest of the codebase uses `pose` consistently (`GeneratedImage.pose`, task writes `pose: 'front'`, etc.). The mismatch is cosmetic but will grow more confusing as we add multi-pose model support.

**Why not now:** Requires a Prisma migration + `prisma generate`. Low risk but unnecessary churn before the billing enforcement and pose-gating work is stabilised. Do this in a dedicated cleanup PR after Option C (plan ceiling × brand preference pose intersection) is fully wired.

**Fix:** Rename `angleId` → `poseId` in `prisma/schema.prisma` on the `Model` model, generate and run migration, update `app/routes/app.model-builder.tsx` (line 106) to write `poseId: 'front'`.
