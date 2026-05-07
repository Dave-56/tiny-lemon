import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  getUserFacingImageServiceError,
  hasCleanWhiteFlatLayBackground,
  normalizeFlatLayToPng,
} from "./flatLayCleanup";

async function makeTestImage(background: string) {
  const base = sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background,
    },
  }).png();

  return base
    .composite([
      {
        input: Buffer.from(
          `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
            <rect x="38" y="26" width="44" height="68" rx="2" fill="#991b1b"/>
          </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .toBuffer();
}

describe("flat lay cleanup helpers", () => {
  it("detects a garment on a clean white background", async () => {
    const buffer = await makeTestImage("#ffffff");

    await expect(
      hasCleanWhiteFlatLayBackground(buffer.toString("base64")),
    ).resolves.toBe(true);
  });

  it("does not treat a colored background as already clean", async () => {
    const buffer = await makeTestImage("#94a3b8");

    await expect(
      hasCleanWhiteFlatLayBackground(buffer.toString("base64")),
    ).resolves.toBe(false);
  });

  it("normalizes clean input to a PNG base64 payload", async () => {
    const buffer = await makeTestImage("#ffffff");
    const normalized = await normalizeFlatLayToPng(buffer.toString("base64"));
    const metadata = await sharp(Buffer.from(normalized, "base64")).metadata();

    expect(metadata.format).toBe("png");
  });

  it("maps provider credit and quota failures to a non-generic merchant message", () => {
    expect(
      getUserFacingImageServiceError(
        new Error("429 RESOURCE_EXHAUSTED: quota exceeded, check billing credits"),
        "Failed to process image. Please try again.",
      ),
    ).toBe(
      "AI image generation is temporarily at capacity. Please try again in a few minutes.",
    );
  });
});
