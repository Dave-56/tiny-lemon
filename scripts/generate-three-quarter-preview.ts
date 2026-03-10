/**
 * Regenerate only the three-quarter pose preset preview.
 *
 * Uses the same flat lay + model as the main seed script. Generates front first
 * (needed as length anchor), then three-quarter; writes only
 * public/presets/poses/three-quarter.png.
 *
 * Prerequisites: GEMINI_API_KEY in .env; front-flatlay.png/jpg and model.png
 * in scripts/seed-preset-assets/ (or SEED_FLAT_LAY_PATH / SEED_MODEL_PATH).
 *
 * Usage: npx tsx scripts/generate-three-quarter-preview.ts
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';
import { extractGarmentSpec } from '../app/lib/garmentSpec';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../app/lib/pdpPresets';
import type { GarmentSpec } from '../app/lib/garmentSpec';

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
      'Seed images not found. Place front-flatlay.png/jpg and model.png in scripts/seed-preset-assets/ (or set SEED_FLAT_LAY_PATH / SEED_MODEL_PATH).'
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

  mkdirSync(join(PUBLIC_PRESETS, 'poses'), { recursive: true });

  const ai = new GoogleGenAI({ apiKey });
  const genConfig = {
    temperature: 0.2,
    imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH as const },
  };
  const whiteStudio = PDP_STYLE_PRESETS[0];
  const minimalStyling = STYLING_DIRECTION_PRESETS[0];
  const hasBack = false;

  // Front (length anchor for three-quarter)
  console.log('Generating front pose (length anchor)...');
  const frontChat = ai.chats.create({
    model: 'gemini-3.1-flash-image-preview',
    config: genConfig,
  });
  const frontPrompt = buildPromptFromSpec(
    garmentSpec,
    'front',
    whiteStudio.promptSnippet,
    hasBack,
    false,
    undefined,
    minimalStyling,
    undefined
  );
  const frontResp = await frontChat.sendMessage({
    message: [
      { inlineData: { data: flatLayB64, mimeType: cleanMime } },
      { inlineData: { data: normalizedModelB64, mimeType: 'image/png' } },
      { text: frontPrompt },
    ],
    config: genConfig,
  });
  const frontB64 = extractBase64(frontResp);

  // Three-quarter only
  console.log('Generating three-quarter pose...');
  const tqChat = ai.chats.create({
    model: 'gemini-3.1-flash-image-preview',
    config: genConfig,
  });
  const tqPrompt = buildPromptFromSpec(
    garmentSpec,
    'three-quarter',
    whiteStudio.promptSnippet,
    hasBack,
    true,
    undefined,
    minimalStyling,
    undefined
  );
  const tqResp = await tqChat.sendMessage({
    message: [
      { inlineData: { data: flatLayB64, mimeType: cleanMime } },
      { inlineData: { data: normalizedModelB64, mimeType: 'image/png' } },
      { inlineData: { data: frontB64, mimeType: 'image/png' } },
      { text: tqPrompt },
    ],
    config: genConfig,
  });
  const tqB64 = extractBase64(tqResp);
  const outBuffer = await sharp(Buffer.from(tqB64, 'base64'))
    .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
    .png()
    .toBuffer();
  const outPath = join(PUBLIC_PRESETS, 'poses', 'three-quarter.png');
  writeFileSync(outPath, outBuffer);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
