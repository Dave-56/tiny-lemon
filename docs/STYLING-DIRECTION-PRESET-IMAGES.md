# Styling direction preset images: one outfit (and optionally model) per direction

**Goal:** Improve storytelling for the six styling direction presets (Minimal Clarity, Accessible Warmth, Editorial Cool, Premium Poise, Street Energy, Athletic Performance) by using **one outfit—and optionally one model—per styling direction** instead of the same garment/model for all six.

**Current state:** `scripts/generate-preset-previews.ts` uses a single flat lay + single model for every preset. Styling direction previews differ only by pose/expression (“energy”). That keeps the variable controlled but can feel generic (e.g. “Athletic Performance” in a slip dress).

**Target state (Option 2):** Each styling direction has a dedicated example that matches the label—e.g. Athletic with activewear, Street with casual streetwear, Premium with a tailored look—so the card clearly “tells the story” of that energy.

---

## Two implementation approaches

### A. Archetypes (2–3 setups)

- Define **2–3 archetypes** (e.g. `casual`, `smart`, `athletic`).
- Assign each of the 6 styling directions to an archetype:
  - e.g. **casual:** Accessible Warmth, Street Energy  
  - e.g. **smart:** Minimal Clarity, Editorial Cool, Premium Poise  
  - e.g. **athletic:** Athletic Performance  
- Seed assets: one flat lay (+ optional model) per archetype (e.g. `styling/casual/flatlay.png`, `styling/smart/flatlay.png`, `styling/athletic/flatlay.png`).
- **Pros:** Fewer assets to maintain (2–3 outfits, not 6). Clear grouping.  
- **Cons:** Two styling directions that share an archetype will show the same outfit (different pose/expression only).

### B. Different outfit per direction, same model

- **One flat lay per styling direction** (6 flat lays), **same model** for all.
- Seed assets: e.g. `styling/minimal/flatlay.png`, `styling/accessible/flatlay.png`, … `styling/athletic/flatlay.png`, and a single `model.png`.
- **Pros:** Each card is a distinct vignette (outfit + energy). Same model keeps “person” constant so the variable is “outfit + energy.”  
- **Cons:** 6 flat lays to source and maintain.  
- **Clarity:** In the UI, label or tooltip can make the intent explicit (e.g. “Example: Athletic energy with activewear”) so users understand these are example vignettes, not “same garment, different energy.”

---

## What to change (for next agent)

1. **Seed assets structure**
   - **Option A:** Add e.g. `scripts/seed-preset-assets/styling/casual/flatlay.png` (and optionally `model.png` per archetype), same for `smart`, `athletic`. Document in `scripts/seed-preset-assets/README.md`.
   - **Option B:** Add `scripts/seed-preset-assets/styling/{id}/flatlay.png` for each preset `id` (minimal, accessible, editorial, premium, street, athletic); keep one shared `model.png` (or one per direction if you later choose different models).

2. **Seed script: styling section only**
   - In `scripts/generate-preset-previews.ts`, **do not** change background or pose generation (they stay single flat lay + single model).
   - For the **styling direction** loop:
     - **Option A:** Resolve archetype per preset (e.g. from a mapping `stylingId → archetype`). For each preset, load that archetype’s flat lay (and model if used). Run one front-pose generation with that preset’s `stylingDirection` and write to `public/presets/styling/{id}.png`.
     - **Option B:** For each styling preset, load `styling/{id}/flatlay.png` and the shared model. Run one front-pose generation with that preset’s styling direction and write to `public/presets/styling/{id}.png`.
   - Reuse existing `buildPromptFromSpec`, `extractGarmentSpec`, `normalizeReferenceImageServer`; only the **input assets** (and possibly which model image) change per styling preset.

3. **Preset types / labels (optional)**
   - If you want explicit “example vignette” copy, add an optional short label or tooltip per styling preset (e.g. “Example: Athletic energy with activewear”) in `app/lib/pdpPresets.ts` or the brand-style UI, so it’s clear we’re showing “outfit + energy” for that card.

4. **README and npm**
   - Update `scripts/seed-preset-assets/README.md` with the chosen structure (archetype folders vs per-id folders, and whether model is per-archetype/direction or shared).
   - No change to `imageUrl` in presets: they already point to `public/presets/styling/{id}.png`; the script just fills those with the new per-outfit (and optionally per-model) images.

---

## Summary

- **Background and pose presets:** Unchanged; single flat lay + single model.
- **Styling direction presets:** One outfit (and optionally model) per direction—either via 2–3 archetypes (Option A) or 6 separate flat lays + same model (Option B). Script: only the styling loop in `generate-preset-previews.ts` and the seed-asset layout need to be implemented; use existing prompt/spec/normalize logic.
