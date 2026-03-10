# Seed assets for preset previews

Place two images here before running the preset preview generator:

1. **front-flatlay.png** – A clean front flat-lay photo of a single garment (white or neutral background). This is used to extract a garment spec and to generate all preset preview images (backgrounds, poses, styling directions).

2. **model.png** – A full-body reference photo of a fashion model. The generator will “dress” this model in the garment from the flat lay for each preset.

Then from the project root:

```bash
npx tsx scripts/generate-preset-previews.ts
```

The script writes PNGs to `public/presets/backgrounds/`, `public/presets/poses/`, and `public/presets/styling/`. Commit those files so they ship with the app. Until you run the script and commit the PNGs, the brand-style UI will show the fallback placeholder for these options.

**Environment:** `GEMINI_API_KEY` must be set (e.g. in `.env`). The script does not create outfit records or consume user credits.

**Optional:** Override paths with `SEED_FLAT_LAY_PATH` and `SEED_MODEL_PATH`.

To regenerate only the three-quarter pose preview (e.g. for a clearer 45° turn), run `npm run seed:three-quarter`.
