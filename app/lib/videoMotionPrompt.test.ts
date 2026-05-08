import { describe, expect, it } from "vitest";

import { buildVideoMotionPrompt } from "./videoMotionPrompt";

describe("buildVideoMotionPrompt", () => {
  it("asks for a single-direction 360 product turn", () => {
    const { prompt, negativePrompt } = buildVideoMotionPrompt("minimal");

    expect(prompt).toContain("360-degree ecommerce product turnaround");
    expect(prompt).toContain("Start on the provided start image");
    expect(prompt).toContain("reaches the back view around the midpoint");
    expect(prompt).toContain("returns to the same exact front-facing catalog view");
    expect(prompt).toContain("so the clip can loop cleanly");
    expect(prompt).toContain("Treat any reference images as angle and appearance guides");
    expect(prompt).toContain("Style energy: Minimal Clarity.");
    expect(prompt).not.toContain("<<<image_1>>>");

    expect(negativePrompt).toContain("rocking left and right");
    expect(negativePrompt).toContain("reversing direction");
    expect(negativePrompt).toContain("repeated back-and-forth turning");
    expect(negativePrompt).toContain("ending on back view");
    expect(negativePrompt).toContain("mismatched first and final frame");
    expect(negativePrompt).toContain("camera orbit");
  });
});
