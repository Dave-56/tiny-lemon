# Tiny Lemon — Feature Roadmap

## v2 Release Notes

- Advisory flat‑lay validation (Gemini): Non‑blocking quality check on uploads with clear badges (good/warn/fail). Fast via client downscale + server caching; privacy‑first (hash only, no image storage). Kill switch and threshold tuning via env. No DB changes; does not affect Generate flow.

## Future Enhancements

### 1. Detail crop (zoomed-in 3/4)
- **Description:** Add an extra zoomed-in 3/4 shot (waist-to-knee) for texture and fit details on tricky fabrics (satin, knits) and critical areas like neckline or waistband.
- **Why:** Perplexity research suggests this is a standard e-com best practice — particularly valuable for premium/luxury positioning where fabric quality matters.
- **Scope:** New pose type in generation pipeline, UI slot in outfit card, plan gating (premium plans only?).

### 2. Consistent camera framing across catalog
- **Description:** Ensure every product uses the same camera height, distance, and crop so grids look consistent across the catalog.
- **Why:** Grid consistency is a key differentiator for professional-looking storefronts.

### 3. Ghost mannequin catalog shots
- **Status:** Planned
- **Description:** Add a ghost mannequin output option that turns clean flat-lay or supplier product photos into polished, model-free catalog images with consistent white/neutral backgrounds.
- **Why:** Small clothing brands often need both clean catalog shots and on-model PDP images, but studio ghost mannequin photography is expensive and slow across large SKU counts.
- **Scope:** Preserve garment details such as collars, hems, stitching, sleeve shape, prints, and fabric texture; add a review step before publishing; explore Shopify product image publishing alongside existing on-model outputs.

## Catalog Operations Backlog

### Bulk catalog pipeline
- **Status:** Backlog
- **Description:** Let merchants process many SKUs at once using the same cleanup, model, style, export, and publishing settings.
- **Why:** Stores with 200+ SKUs lose too much time repeating the same product-media steps one image at a time.
- **Scope:** Bulk upload/import, shared generation settings, queued processing, per-SKU review, retry failed items, and clear progress states.

### Marketplace export presets
- **Status:** Backlog
- **Description:** Add export presets for common product-media destinations such as Shopify, Amazon main images, Amazon secondary images, Instagram, and social ads.
- **Why:** Merchants often need the same product visual resized, cropped, and formatted differently across selling channels.
- **Scope:** Preset dimensions, background rules, filename conventions, ZIP export, and guardrails that distinguish Shopify-ready from Amazon-compliance-ready images.

### Catalog consistency checker
- **Status:** Backlog
- **Description:** Scan product images for inconsistent backgrounds, crops, framing, lighting, dimensions, and resolution before publishing.
- **Why:** Visual inconsistency makes catalogs feel less trustworthy and is hard to catch manually at SKU scale.
- **Scope:** Per-image warnings, catalog-level consistency score, background/crop/framing checks, low-resolution detection, and suggested fixes.

### Batch QA dashboard
- **Status:** Backlog
- **Description:** Give merchants a review queue that flags images likely to need human attention before they go live.
- **Why:** AI and supplier-photo workflows still need QA, but review time should focus on risky outputs rather than every image equally.
- **Scope:** Flags for watermarks, low resolution, busy backgrounds, odd crops, garment-detail risk, marketplace-format issues, and generation failures.

### Direct publish and sync workflow
- **Status:** Backlog
- **Description:** Improve the path from generated media to live product pages with approval, publishing, and sync controls.
- **Why:** The value is not only generating images; it is reducing the operational work between product media creation and storefront updates.
- **Scope:** Approve-to-publish for Shopify products, replace or append image behavior, sync status, rollback/removal controls, and future Amazon export package support.

### Source-photo standards guide
- **Status:** Backlog
- **Description:** Tell merchants whether an uploaded supplier, flat-lay, or mannequin photo is good enough before generation.
- **Why:** Better source photos produce better outputs, and merchants need fast feedback before wasting credits or time.
- **Scope:** Good/warn/fail checks, plain-language reasons, examples of acceptable inputs, recommendations to reshoot or request better supplier images, and integration with existing flat-lay validation.

---

_Add new ideas below as they come up._
