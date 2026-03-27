import { BRAND_STYLE_PRESETS } from "./pdpPresets";

/**
 * Build a motion prompt for video generation from the brand style.
 * V1 keeps motions narrow — optimize for garment fidelity over dramatic motion.
 */

const MOTION_BY_BRAND_STYLE: Record<string, string> = {
  minimal:
    "A very subtle, slow turn of the torso from front to slight three-quarter angle. Minimal body movement. Calm, composed energy. The model shifts weight gently.",
  accessible:
    "A gentle, natural pose shift — slight weight transfer from one leg to the other with a soft, friendly expression. Warm, relaxed energy.",
  editorial:
    "A slow, deliberate half-step forward with a slight chin tilt. Controlled editorial pacing. Confident, poised movement.",
  premium:
    "A refined, minimal turn — the model rotates slowly from front to three-quarter, pausing briefly. Elegant, unhurried pacing.",
  street:
    "A casual, relaxed pose shift with a slight bounce of energy. Natural, effortless movement. The model adjusts stance loosely.",
  athletic:
    "A slight step forward with dynamic but controlled energy. Grounded posture, athletic poise. Subtle movement in arms and torso.",
};

const DEFAULT_MOTION =
  "A very subtle, slow turn of the torso from front to slight three-quarter angle. Minimal body movement. Calm, composed energy.";

const FIDELITY_SUFFIX =
  "The garment remains fully visible and undistorted throughout all frames. Fabric drape, color, pattern, and all printed text or logos stay consistent and legible. No warping, no color shift, no pattern drift.";

const NEGATIVE_PROMPT =
  "garment color drift, pattern distortion, logo warping, text illegibility, face morphing, sudden jerky motion, camera shake, background flickering, extra limbs";

export function buildVideoMotionPrompt(brandStyleId: string): {
  prompt: string;
  negativePrompt: string;
} {
  const preset = BRAND_STYLE_PRESETS.find((p) => p.id === brandStyleId);
  const motionBase = MOTION_BY_BRAND_STYLE[brandStyleId] ?? DEFAULT_MOTION;

  const styleHint = preset
    ? `Style energy: ${preset.label}.`
    : "";

  const prompt = [motionBase, styleHint, FIDELITY_SUFFIX]
    .filter(Boolean)
    .join(" ");

  return { prompt, negativePrompt: NEGATIVE_PROMPT };
}
