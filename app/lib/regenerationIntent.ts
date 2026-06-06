import type { RegeneratePose } from './regeneratePoses';

export type RegenerationIntentRiskLevel = 'low' | 'medium' | 'high';

export type RegenerationIntentSubject =
  | 'lighting_background'
  | 'pose_styling'
  | 'product_change'
  | 'model_identity'
  | 'mixed'
  | 'unspecified';

export type RegenerationIntent = {
  targetImages: string;
  editSubject: RegenerationIntentSubject;
  normalizedInstruction: string;
  preservationRules: string[];
  riskLevel: RegenerationIntentRiskLevel;
  clarificationNeeded: boolean;
  reasons: string[];
};

type NormalizeRegenerationIntentArgs = {
  userDirection?: string | null;
  targetPoses?: RegeneratePose[] | null;
};

const DEFAULT_PRESERVATION_RULES = [
  'Preserve the merchant product exactly: garment color, fabric, fit, silhouette, graphics, logo/text, placement, scale, and legibility.',
  'Treat user styling terms as surrounding outfit, accessory, pose, lighting, or backdrop direction unless the user explicitly names the merchant product garment.',
  'Do not edit the model identity, face, body proportions, or skin tone unless a future confirmed workflow explicitly allows it.',
  'For non-target images, preserve the existing result and styling continuity.',
];

const LIGHTING_BACKGROUND_RE =
  /\b(light|lighting|shadow|shadows|background|backdrop|studio|grey|gray|white|warm|cool|contrast|exposure|camera|framing)\b/i;

const POSE_STYLING_RE =
  /\b(pose|poses|hands?|arms?|sleeves?|rolled|relaxed|hips?|shorts?|pants?|jeans|tee|t-shirt|cap|hat|socks?|shoes?|trainers?|sandals?|accessor(?:y|ies)|outfit|styling)\b/i;

const MODEL_IDENTITY_RE =
  /\b(face|facial|hair|skin tone|body shape|body type|gender|age|younger|older|ethnicity|race)\b/i;

const PRODUCT_CHANGE_RE =
  /\b(remove|replace|change|alter|erase|delete|hide|cover|redesign|make different)\b[\s\S]{0,40}\b(product|garment|shirt|sweater|dress|hoodie|logo|graphic|print|text|typography|design)\b/i;

const PRODUCT_PRESERVE_RE =
  /\b(keep|preserve|exactly|same|unchanged|as it is|do not change|don't change)\b[\s\S]{0,60}\b(graphic|logo|print|text|typography|design|product|garment)\b/i;

const NO_LOGOS_RE = /\b(no|without)\s+(?:trade\s*marks?|trademarks?|logos?|branding)\b/i;

function cleanInstruction(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function labelTargetImages(targetPoses?: RegeneratePose[] | null): string {
  if (!targetPoses?.length) return 'full generated set';
  return targetPoses.map((pose) => pose.replace('-', ' ')).join(', ');
}

function inferSubject(instruction: string): RegenerationIntentSubject {
  if (!instruction) return 'unspecified';

  const hasProductChange = PRODUCT_CHANGE_RE.test(instruction);
  const hasModelIdentity = MODEL_IDENTITY_RE.test(instruction);
  const hasLightingBackground = LIGHTING_BACKGROUND_RE.test(instruction);
  const hasPoseStyling = POSE_STYLING_RE.test(instruction);

  const subjects = [
    hasProductChange && 'product_change',
    hasModelIdentity && 'model_identity',
    hasLightingBackground && 'lighting_background',
    hasPoseStyling && 'pose_styling',
  ].filter(Boolean);

  if (subjects.length > 1) return 'mixed';
  if (hasProductChange) return 'product_change';
  if (hasModelIdentity) return 'model_identity';
  if (hasLightingBackground) return 'lighting_background';
  if (hasPoseStyling) return 'pose_styling';
  return 'unspecified';
}

export function normalizeRegenerationIntent({
  userDirection,
  targetPoses,
}: NormalizeRegenerationIntentArgs): RegenerationIntent | null {
  const normalizedInstruction = cleanInstruction(userDirection);
  if (!normalizedInstruction) return null;

  const reasons: string[] = [];
  const preservationRules = [...DEFAULT_PRESERVATION_RULES];
  const editSubject = inferSubject(normalizedInstruction);

  let riskLevel: RegenerationIntentRiskLevel = 'low';

  if (PRODUCT_PRESERVE_RE.test(normalizedInstruction)) {
    preservationRules.push(
      'The user explicitly asked to keep product graphics/design unchanged. Prioritize exact graphic fidelity over styling changes.',
    );
    reasons.push('explicit_product_preservation');
  }

  if (NO_LOGOS_RE.test(normalizedInstruction)) {
    preservationRules.push(
      'If the user says no logos, no trademarks, or no branding, apply that only to newly invented accessories, shoes, caps, or surrounding styling. Never remove or alter the merchant product graphic/logo/text.',
    );
    riskLevel = 'medium';
    reasons.push('no_logo_language');
  }

  if (PRODUCT_CHANGE_RE.test(normalizedInstruction)) {
    riskLevel = 'high';
    reasons.push('possible_product_change');
    preservationRules.push(
      'Ignore unsafe product-alteration parts unless they can be applied without changing the merchant product identity or details.',
    );
  }

  if (MODEL_IDENTITY_RE.test(normalizedInstruction)) {
    riskLevel = 'high';
    reasons.push('possible_model_identity_change');
  }

  return {
    targetImages: labelTargetImages(targetPoses),
    editSubject,
    normalizedInstruction,
    preservationRules,
    riskLevel,
    clarificationNeeded: riskLevel === 'high',
    reasons,
  };
}

export function buildRegenerationIntentPromptBlock(
  args: NormalizeRegenerationIntentArgs,
): string | null {
  const intent = normalizeRegenerationIntent(args);
  if (!intent) return null;

  return [
    'STRUCTURED REGENERATION INTENT:',
    `- Target image(s): ${intent.targetImages}.`,
    `- Interpreted edit subject: ${intent.editSubject}.`,
    `- Merchant instruction: ${intent.normalizedInstruction}`,
    `- Risk level: ${intent.riskLevel}${intent.clarificationNeeded ? ' (apply only safe parts)' : ''}.`,
    '- Preservation rules:',
    ...intent.preservationRules.map((rule) => `  - ${rule}`),
  ].join('\n');
}
