import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  classifyImageProviderError,
  createUserFacingImageProviderError,
  getUserFacingImageServiceError,
  hasCleanWhiteFlatLayBackground,
  isRefundableImageProviderFailure,
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

  it("classifies Gemini quota and rate limit errors together", () => {
    expect(
      classifyImageProviderError(
        new Error("429 RESOURCE_EXHAUSTED: quota exceeded"),
      ),
    ).toBe("quota_or_rate_limit");
    expect(
      classifyImageProviderError(
        new Error("Too many requests. Please respect the rate limit."),
      ),
    ).toBe("quota_or_rate_limit");
  });

  it("classifies provider billing errors separately from quota errors", () => {
    expect(
      classifyImageProviderError(
        new Error("Billing account disabled or payment required"),
      ),
    ).toBe("provider_billing");
  });

  it("classifies input and safety errors", () => {
    expect(classifyImageProviderError(new Error("SAFETY: blocked"))).toBe(
      "safety",
    );
    expect(classifyImageProviderError(new Error("INVALID_ARGUMENT: invalid image"))).toBe(
      "invalid_input",
    );
  });

  it("marks provider-side image failures as refundable", () => {
    const quotaError = createUserFacingImageProviderError(
      new Error("429 RESOURCE_EXHAUSTED: quota exceeded"),
      "fallback",
    );
    const unavailableError = createUserFacingImageProviderError(
      new Error("503 model overloaded"),
      "fallback",
    );

    expect(isRefundableImageProviderFailure(quotaError)).toBe(true);
    expect(isRefundableImageProviderFailure(unavailableError)).toBe(true);
  });

  it("does not mark merchant input failures as refundable", () => {
    const safetyError = createUserFacingImageProviderError(
      new Error("SAFETY: blocked"),
      "fallback",
    );
    const invalidInputError = createUserFacingImageProviderError(
      new Error("INVALID_ARGUMENT: invalid image"),
      "fallback",
    );

    expect(isRefundableImageProviderFailure(safetyError)).toBe(false);
    expect(isRefundableImageProviderFailure(invalidInputError)).toBe(false);
  });
});
