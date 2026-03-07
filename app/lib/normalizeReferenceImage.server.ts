/**
 * Server-side equivalent of normalizeReferenceImage.ts (which uses browser Canvas).
 * Pads the model reference image to a 1:1 square (max 1024px) with white letterboxing
 * so Gemini receives consistent framing across runs — mirrors the canvas version exactly.
 */
export async function normalizeReferenceImageServer(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const size = Math.min(Math.max(meta.width ?? 512, meta.height ?? 512), 1024);
  return sharp(buffer)
    .resize(size, size, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
}
