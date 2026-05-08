import { BRAND_STYLE_PRESETS } from "./pdpPresets";

/**
 * Build a motion prompt for video generation from the brand style.
 * V1 keeps motion product-focused: one smooth turn, no dance-like rocking.
 */

const MOTION_PROMPT =
  "Create a smooth continuous 360-degree ecommerce product turnaround of the same model wearing the same outfit. Start on the provided start image: an exact front-facing catalog view. The model rotates in one consistent direction, reaches the back view around the midpoint, continues through the opposite side, and returns to the same exact front-facing catalog view by the final frame. The final frame should closely match the first frame in body angle, camera position, framing, posture, garment shape, lighting, and background so the clip can loop cleanly. Treat any reference images as angle and appearance guides, not as separate shots or jump cuts. Keep the camera locked on a tripod. Keep the same model identity, body shape, hair, shoes, accessories, garment fit, silhouette, color, pattern, logos, and fabric texture. Use minimal arm movement and calm composed posture.";

const NEGATIVE_PROMPT =
  "rocking left and right, reversing direction, repeated back-and-forth turning, ending on back view, ending on side view, mismatched first and final frame, jump cut, camera movement, camera orbit, garment color drift, pattern distortion, logo warping, face morphing, identity drift, body shape drift, sudden jerky motion, extra limbs, new accessories, outfit redesign";

export function buildVideoMotionPrompt(brandStyleId: string): {
  prompt: string;
  negativePrompt: string;
} {
  const preset = BRAND_STYLE_PRESETS.find((p) => p.id === brandStyleId);
  const motionBase = MOTION_PROMPT;

  const styleHint = preset
    ? `Style energy: ${preset.label}.`
    : "";

  const prompt = [motionBase, styleHint]
    .filter(Boolean)
    .join(" ");

  return { prompt, negativePrompt: NEGATIVE_PROMPT };
}
