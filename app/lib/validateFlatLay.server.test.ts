import { describe, expect, it } from "vitest";
import { classifyGarmentCount } from "./validateFlatLay.server";

describe("classifyGarmentCount", () => {
  it("accepts a single garment even when validator confidence is low", () => {
    expect(classifyGarmentCount({ count: 1, confidence: 0.42 })).toEqual({
      quality: "good",
    });
  });

  it("warns instead of hard-failing ambiguous multiple-garment reads", () => {
    expect(classifyGarmentCount({ count: 2, confidence: 0.6 })).toEqual({
      quality: "warn",
      reasons: ["multiple_garments", "low_confidence"],
    });
  });

  it("fails confident multiple-garment reads", () => {
    expect(classifyGarmentCount({ count: 2, confidence: 0.9 })).toEqual({
      quality: "fail",
      reasons: ["multiple_garments"],
    });
  });

  it("fails confident no-garment reads", () => {
    expect(classifyGarmentCount({ count: 0, confidence: 0.9 })).toEqual({
      quality: "fail",
      reasons: ["no_garment"],
    });
  });
});
