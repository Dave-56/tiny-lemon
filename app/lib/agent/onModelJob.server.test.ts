import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.server", () => ({
  default: { outfit: { findFirst: vi.fn() } },
  ensureShop: vi.fn(),
}));
vi.mock("../triggerGeneration.server", () => ({
  handleTriggerGeneration: vi.fn(),
}));

import {
  ON_MODEL_EXAMPLE_INPUT,
  jobResponse,
  onModelInputSchema,
  parseOnModelInput,
} from "./onModelJob.server";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("parseOnModelInput", () => {
  it("rejects an empty body before any payment", () => {
    const parsed = parseOnModelInput({});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(400);
      expect(parsed.error).toBe("missing_garment");
    }
  });

  it("accepts the documented example and applies defaults", () => {
    const parsed = parseOnModelInput(ON_MODEL_EXAMPLE_INPUT);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.garmentImageUrl).toBe(ON_MODEL_EXAMPLE_INPUT.garmentImageUrl);
      expect(parsed.input.modelId).toBe("model-01");
      expect(parsed.input.wait).toBe(20);
    }
  });

  it("requires https garment URLs", () => {
    const parsed = parseOnModelInput({ garmentImageUrl: "http://example.com/a.png" });
    expect(parsed.ok).toBe(false);
  });

  it("accepts a data URL and reads its mime type", () => {
    const parsed = parseOnModelInput({ garmentImageBase64: `data:image/jpeg;base64,${PNG_1x1}` });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.mimeType).toBe("image/jpeg");
      expect(parsed.input.garmentImageBase64).toBe(PNG_1x1);
    }
  });

  it("rejects unknown models and clamps wait", () => {
    expect(parseOnModelInput({ garmentImageBase64: PNG_1x1, modelId: "model-99" }).ok).toBe(false);
    const parsed = parseOnModelInput({ garmentImageBase64: PNG_1x1, wait: 999 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.wait).toBe(110);
  });

  it("refuses both garment fields at once", () => {
    const parsed = parseOnModelInput({
      garmentImageUrl: "https://example.com/a.png",
      garmentImageBase64: PNG_1x1,
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("onModelInputSchema", () => {
  it("lists every preset model and gives the required field an example", () => {
    const schema = onModelInputSchema() as {
      required: string[];
      properties: { garmentImageUrl: { example: string }; modelId: { enum: string[] } };
    };
    expect(schema.required).toEqual(["garmentImageUrl"]);
    expect(schema.properties.garmentImageUrl.example).toMatch(/^https:\/\//);
    expect(schema.properties.modelId.enum).toContain("model-01");
    expect(schema.properties.modelId.enum.length).toBeGreaterThan(10);
  });
});

describe("jobResponse", () => {
  const createdAt = new Date("2026-09-03T18:00:00.000Z");

  it("returns 200 with the image when completed", () => {
    const { status, body } = jobResponse(
      {
        status: "completed",
        jobId: "job1",
        modelId: "model-01",
        createdAt,
        image: { url: "https://blob/x.png", mimeType: "image/png", width: 800, height: 1200, pose: "front" },
      },
      "https://tinylemon.xyz",
    );
    expect(status).toBe(200);
    expect(body.statusUrl).toBe("https://tinylemon.xyz/api/on-model/jobs/job1");
    expect((body.image as { url: string }).url).toBe("https://blob/x.png");
    expect((body.model as { name: string }).name).toBe("Aisha");
  });

  it("returns 202 with a poll hint while processing", () => {
    const { status, body } = jobResponse(
      { status: "processing", jobId: "job2", modelId: "model-01", createdAt, stage: "generating_front" },
      "https://tinylemon.xyz",
    );
    expect(status).toBe(202);
    expect(body.pollAfterSeconds).toBe(5);
    expect(body.stage).toBe("generating_front");
  });

  it("returns 502 when the job failed", () => {
    const { status, body } = jobResponse(
      { status: "failed", jobId: "job3", modelId: "model-01", createdAt, error: "boom" },
      "https://tinylemon.xyz",
    );
    expect(status).toBe(502);
    expect(body.error).toBe("boom");
  });
});
