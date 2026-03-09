# Plan: SEO, free tool, and blog (revised)

**Purpose:** Get more organic traffic and AI (ChatGPT/Claude) recommendations by adding a public free-tool page and a blog.

**Inspired by:** [GenLook launch story](https://thibault.sh/blog/genlook-launch-story) — landing + free tool + blog led to ChatGPT sending traffic and ranking for “virtual try-on Shopify app” queries.

---

## 1. Goals and success criteria

| Goal | Success |
|------|--------|
| **Free tool as lead magnet** | Visitors can try “one flat-lay → one studio shot” without connecting a store; clear CTA to install the app. |
| **SEO** | New indexable URLs (`/try`, `/blog`, `/blog/…`) with clear titles and descriptions. |
| **AI recommendations** | Content (blog + free tool page) is easy for ChatGPT/Claude to cite for “Shopify app flat lay to model” type queries. |

---

## 2. What was built

### Blog (Phase 1)
- **Content:** `content/blog/*.md` with frontmatter (title, slug, date, excerpt).
- **Routes:** `blog._index.tsx` (list), `blog.$slug.tsx` (single post). Slug `"blog"` redirects to index.
- **Sample post:** `flat-lay-to-studio-shot-shopify.md` targeting “how to get studio-style product photos from flat-lays”.
- **Nav/footer:** “Blog” and “Try free” added to landing, features, pricing, try, and blog pages.

### Free tool (Phase 2 + 3)
- **Route:** `/try` — upload one flat-lay, pick one preset model, one front-angle generation.
- **Backend:** Demo shop (`DEMO_SHOP_ID`, default `__demo__`). Billing short-circuit (no credit transactions); rate limit 1/IP/24h (in-memory; use KV in production if needed).
- **Status:** Public `GET /try/status?outfitId=...` returns status/images only when `outfit.shopId === DEMO_SHOP_ID`.
- **Invocation:** Try flow uses its own form action on `try.tsx` (does **not** use the Bearer-only `api.trigger-generation`).

### Sitemap (Phase 4)
- **Route:** `/sitemap.xml` — generated from blog content (all `/blog` and `/blog/<slug>` plus static pages).

---

## 3. Implementation notes (from feedback)

### Free tool — Billing and demo shop
- **Billing (A2):** In `getPlanForShop(shopId)` and `reserveGenerations(shopId, count)`, when `shopId === DEMO_SHOP_ID`: return `"free"` and do **not** create any `creditTransaction` rows. Rate limit is enforced in the try route **before** calling `handleTriggerGeneration`.
- **Shop row:** `ensureShop(DEMO_SHOP_ID)` is called in the try action so the demo shop exists for `Outfit.shopId`.
- **Angles:** In `handleTriggerGeneration`, when `shopId === DEMO_SHOP_ID`, `allowedPoses` is forced to `["front"]` (brand-style overrides are not applied for demo).
- **Model URL:** The try page sends only preset `imageUrl` from `preset-models.json` as `modelImageUrl`.

### Free tool — Invocation and polling
- Do **not** use the existing Bearer-only route `api.trigger-generation` for the try flow.
- Try action on `try.tsx`: get IP → check rate limit → build body (preset model + flat-lay base64) → `ensureShop(DEMO_SHOP_ID)` → `handleTriggerGeneration(DEMO_SHOP_ID, body)` → return `{ outfitId, shopId }`.
- Public status: `GET /try/status?outfitId=...` loads outfit, checks `outfit.shopId === DEMO_SHOP_ID`, returns `{ status, errorMessage, images }`.

### Blog and sitemap
- Blog list at `/blog`; slug `"blog"` redirects to `/blog` in `blog.$slug` loader.
- Sitemap is a **route** that reads blog content and outputs XML; new posts are included automatically.

### Operations
- **Demo in analytics/support:** Filter `DEMO_SHOP_ID` (e.g. `__demo__`) from merchant-facing analytics and support views so demo usage is not shown as normal shop activity.

---

## 4. Decisions

| Decision | Choice |
|----------|--------|
| Free-tool backend | Demo shop (Option A); no credits, rate limit only. |
| Rate limit | 1/IP/24h (in-memory; production: consider KV). |
| Watermark | None for v1. |
| Blog format | Markdown + frontmatter in `content/blog`. |

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Free tool cost | Rate limit; one angle; monitor usage. |
| Abuse | Rate limit; same file/size checks as app; optional CAPTCHA later. |
| Demo outfits in DB | Cleanup via cron or manual; filter demo shop in analytics. |
