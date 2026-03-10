import type { GarmentSpec } from './garmentSpec';
import { buildPromptFromSpec } from './garmentFidelityPrompt';
import { STYLING_DIRECTION_PRESETS, PDP_STYLE_PRESETS } from './pdpPresets';

const FORMALWEAR_RE = /evening dress|occasion dress|cocktail dress|gown|tuxedo|suit/i;

const DEMO_QUALITY_SUFFIX = `

QUALITY BAR (non-negotiable): This must be indistinguishable from a hero campaign shot at a premium fashion brand (Reformation, Sandro, Reiss, Mango). Specifically:
- The model must be unmistakably the same person as in the reference — exact face, exact skin tone, exact body proportions, exact hair. No alterations.
- The garment must be an exact reproduction of the flat lay — same color, same texture, same print, every button, zipper, seam, and logo preserved. Nothing invented, nothing omitted.
- Background: seamless grey studio sweep. No props, no distractions, nothing competing with the garment.
- Output must look like a professional studio shoot — not a composite, not AI-generated. Photorealistic. High resolution. Sharp detail throughout.`;

/**
 * Builds the generation prompt for the /try demo path (front pose only).
 *
 * Locked settings vs. the standard flow:
 * - Background: always grey studio
 * - Styling direction: editorial by default; premium poise for formalwear/eveningwear
 * - Quality bar: more assertive language for garment fidelity and model identity
 */
export function buildTryDemoPrompt(
  spec: GarmentSpec,
  modelGender?: string,
  modelHeight?: string,
): string {
  const isFormal = FORMALWEAR_RE.test(spec.garment_type);
  const stylingDir = STYLING_DIRECTION_PRESETS.find(
    (p) => p.id === (isFormal ? 'premium' : 'editorial'),
  )!;
  const greyStudio = PDP_STYLE_PRESETS.find((p) => p.id === 'grey-studio')!;

  const base = buildPromptFromSpec(
    spec,
    'front',
    greyStudio.promptSnippet,
    false,
    false,
    modelHeight,
    stylingDir,
    modelGender,
  );

  return base + DEMO_QUALITY_SUFFIX;
}
