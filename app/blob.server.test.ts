import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
}));

import { uploadBufferToBlob, uploadImageVariant } from "./blob.server";

describe("blob upload helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    mocks.put.mockResolvedValue({ url: "https://blob.example/file.png" });
  });

  it("keeps overwrite opt-in for generic uploads", async () => {
    await uploadBufferToBlob(Buffer.from("x"), "models/shop/model.png");

    expect(mocks.put).toHaveBeenCalledWith(
      "models/shop/model.png",
      expect.any(Buffer),
      expect.objectContaining({
        allowOverwrite: undefined,
      }),
    );
  });

  it("allows overwrite for deterministic generation-owned uploads", async () => {
    await uploadBufferToBlob(
      Buffer.from("x"),
      "outfits/shop/outfit/raw-front.png",
      "image/png",
      { allowOverwrite: true },
    );

    expect(mocks.put).toHaveBeenCalledWith(
      "outfits/shop/outfit/raw-front.png",
      expect.any(Buffer),
      expect.objectContaining({
        allowOverwrite: true,
      }),
    );
  });

  it("allows content-hash variant retries to overwrite the same path", async () => {
    await uploadImageVariant(
      Buffer.from("x"),
      "outfits/shop/outfit/front.abcd1234-800w.webp",
      "image/webp",
      31536000,
    );

    expect(mocks.put).toHaveBeenCalledWith(
      "outfits/shop/outfit/front.abcd1234-800w.webp",
      expect.any(Buffer),
      expect.objectContaining({
        allowOverwrite: true,
      }),
    );
  });
});
