/**
 * One-off seed script: generate preset preview images and write them to public/presets/.
 *
 * Uses the same prompt-building and Gemini image generation as the app, but does NOT
 * create outfit records or call reserveGenerations. Run locally (or where public/ is
 * on disk), then commit the generated PNGs so they ship with the app.
 *
 * Prerequisites:
 * - GEMINI_API_KEY in .env (or environment)
 * - One front flat-lay image and one model reference image in scripts/seed-preset-assets/
 *   (or set SEED_FLAT_LAY_PATH and SEED_MODEL_PATH)
 *
 * Usage: npx tsx scripts/generate-preset-previews.ts
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';
import { extractGarmentSpec } from '../app/lib/garmentSpec';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import {
  PDP_STYLE_PRESETS,
  ANGLE_PRESETS,
  STYLING_DIRECTION_PRESETS,
} from '../app/lib/pdpPresets';
import type { GarmentSpec } from '../app/lib/garmentSpec';
import type { SpecPose } from '../app/lib/garmentFidelityPrompt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED_ASSETS = join(ROOT, 'scripts', 'seed-preset-assets');
const PUBLIC_PRESETS = join(ROOT, 'public', 'presets');

function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

function extractBase64(response: {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ inlineData?: { data?: string } }> };
  }>;
}): string {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  const reason = response.candidates?.[0]?.finishReason;
  if (reason === 'IMAGE_SAFETY' || reason === 'SAFETY') {
    throw new Error('Image filtered by safety system. Try a different garment image.');
  }
  throw new Error('No image returned from Gemini.');
}

async function ensureDir(p: string): Promise<void> {
  mkdirSync(p, { recursive: true });
}

async function main(): Promise<void> {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY. Set it in .env or the environment.');
    process.exit(1);
  }

  const flatLayPath =
    process.env.SEED_FLAT_LAY_PATH ??
    (existsSync(join(SEED_ASSETS, 'front-flatlay.png'))
      ? join(SEED_ASSETS, 'front-flatlay.png')
      : join(SEED_ASSETS, 'front-flatlay.jpg'));
  const modelPath =
    process.env.SEED_MODEL_PATH ?? join(SEED_ASSETS, 'model.png');

  if (!existsSync(flatLayPath) || !existsSync(modelPath)) {
    console.error(
      'Seed images not found. Place a front flat-lay and a model reference in scripts/seed-preset-assets/:\n' +
        '  - front-flatlay.png or front-flatlay.jpg (or set SEED_FLAT_LAY_PATH)\n' +
        '  - model.png (or set SEED_MODEL_PATH)'
    );
    process.exit(1);
  }

  const cleanMime = flatLayPath.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  const flatLayB64 = readFileSync(flatLayPath).toString('base64');
  const modelBuffer = readFileSync(modelPath);

  console.log('Extracting garment spec...');
  const garmentSpec: GarmentSpec = await extractGarmentSpec(
    flatLayB64,
    cleanMime,
    apiKey
  );

  console.log('Normalizing model reference...');
  const normalizedModelBuffer = await normalizeReferenceImageServer(modelBuffer);
  const normalizedModelB64 = normalizedModelBuffer.toString('base64');

  await ensureDir(join(PUBLIC_PRESETS, 'backgrounds'));
  await ensureDir(join(PUBLIC_PRESETS, 'poses'));
  await ensureDir(join(PUBLIC_PRESETS, 'styling'));

  const ai = new GoogleGenAI({ apiKey });
  const genConfig = {
    temperature: 0.2,
    imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH as const },
  };

  const minimalStyling = STYLING_DIRECTION_PRESETS[0];
  const whiteStudio = PDP_STYLE_PRESETS[0];
  const hasBack = false;

  // ── Backgrounds: one image per PDP style preset (front pose, minimal styling)
  for (const stylePreset of PDP_STYLE_PRESETS) {
    console.log(`Background: ${stylePreset.id}...`);
    const chat = ai.chats.create({
      model: 'gemini-3.1-flash-image-preview',
      config: genConfig,
    });
    const prompt = buildPromptFromSpec(
      garmentSpec,
      'front',
      stylePreset.promptSnippet,
      hasBack,
      false,
      undefined,
      minimalStyling,
      undefined
    );
    const resp = await chat.sendMessage({
      message: [
        { inlineData: { data: flatLayB64, mimeType: cleanMime } },
        { inlineData: { data: normalizedModelB64, mimeType: 'image/png' } },
        { text: prompt },
      ],
      config: genConfig,
    });
    const b64 = extractBase64(resp);
    const outBuffer = await sharp(Buffer.from(b64, 'base64'))
      .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
    const outPath = join(PUBLIC_PRESETS, 'backgrounds', `${stylePreset.id}.png`);
    writeFileSync(outPath, outBuffer);
    console.log(`  wrote ${outPath}`);
  }

  // ── Poses: front → three-quarter → back (each uses previous as length anchor)
  const poseOrder: SpecPose[] = ['front', 'three-quarter', 'back'];
  let frontB64: string | null = null;

  for (const pose of poseOrder) {
    const anglePreset = ANGLE_PRESETS.find((p) => p.id === pose);
    if (!anglePreset) continue;
    console.log(`Pose: ${anglePreset.id}...`);
    const chat = ai.chats.create({
      model: 'gemini-3.1-flash-image-preview',
      config: genConfig,
    });
    const hasLengthAnchor = pose !== 'front' && frontB64 != null;
    const prompt = buildPromptFromSpec(
      garmentSpec,
      pose,
      whiteStudio.promptSnippet,
      hasBack,
      hasLengthAnchor,
      undefined,
      minimalStyling,
      undefined
    );
    const messageParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [
      { inlineData: { data: flatLayB64, mimeType: cleanMime } },
      { inlineData: { data: normalizedModelB64, mimeType: 'image/png' } },
    ];
    if (frontB64) {
      messageParts.push({ inlineData: { data: frontB64, mimeType: 'image/png' } });
    }
    messageParts.push({ text: prompt });

    const resp = await chat.sendMessage({
      message: messageParts,
      config: genConfig,
    });
    const b64 = extractBase64(resp);
    if (pose === 'front') frontB64 = b64;
    const outBuffer = await sharp(Buffer.from(b64, 'base64'))
      .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
    const outPath = join(PUBLIC_PRESETS, 'poses', `${anglePreset.id}.png`);
    writeFileSync(outPath, outBuffer);
    console.log(`  wrote ${outPath}`);
  }

  // ── Styling directions: one image per styling preset (front pose, white studio)
  for (const stylingPreset of STYLING_DIRECTION_PRESETS) {
    console.log(`Styling: ${stylingPreset.id}...`);
    const chat = ai.chats.create({
      model: 'gemini-3.1-flash-image-preview',
      config: genConfig,
    });
    const prompt = buildPromptFromSpec(
      garmentSpec,
      'front',
      whiteStudio.promptSnippet,
      hasBack,
      false,
      undefined,
      stylingPreset,
      undefined
    );
    const resp = await chat.sendMessage({
      message: [
        { inlineData: { data: flatLayB64, mimeType: cleanMime } },
        { inlineData: { data: normalizedModelB64, mimeType: 'image/png' } },
        { text: prompt },
      ],
      config: genConfig,
    });
    const b64 = extractBase64(resp);
    const outBuffer = await sharp(Buffer.from(b64, 'base64'))
      .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
    const outPath = join(PUBLIC_PRESETS, 'styling', `${stylingPreset.id}.png`);
    writeFileSync(outPath, outBuffer);
    console.log(`  wrote ${outPath}`);
  }

  console.log('Done. Update app/lib/pdpPresets.ts imageUrl to use /presets/... paths and commit the new PNGs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
