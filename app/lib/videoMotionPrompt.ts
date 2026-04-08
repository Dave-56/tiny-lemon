import { BRAND_STYLE_PRESETS } from "./pdpPresets";

/**
 * Build a motion prompt for video generation from the brand style.
 * V1 keeps motions narrow — optimize for garment fidelity over dramatic motion.
 */

const MOTION_PROMPT =
  "A very subtle, slow turn of the torso from front to slight three-quarter angle. Minimal body movement. Calm, composed energy.";

const NEGATIVE_PROMPT =
  "garment color drift, pattern distortion, logo warping, text illegibility, face morphing, sudden jerky motion, camera shake, background flickering, extra limbs";

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
