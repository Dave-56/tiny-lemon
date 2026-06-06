import { describe, expect, it } from "vitest";
import { classifyGarmentCount } from "./validateFlatLay.server";

describe("classifyGarmentCount", () => {
  it("accepts a single garment even when validator confidence is low", () => {
    expect(classifyGarmentCount({ count: 1, confidence: 0.42 })).toEqual({
      quality: "good",
    });
  });

  it("accepts multiple-garment outfit sets", () => {
    expect(classifyGarmentCount({ count: 2, confidence: 0.6 })).toEqual({
      quality: "good",
    });
  });

  it("accepts confident multiple-garment outfit sets", () => {
    expect(classifyGarmentCount({ count: 2, confidence: 0.9 })).toEqual({
      quality: "good",
    });
  });

  it("fails confident no-garment reads", () => {
    expect(classifyGarmentCount({ count: 0, confidence: 0.9 })).toEqual({
      quality: "fail",
      reasons: ["no_garment"],
    });
  });
});
