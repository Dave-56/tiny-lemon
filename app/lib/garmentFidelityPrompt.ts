import type { PdpStylePreset, AnglePreset, BrandStylePreset } from './types';
import type { GarmentSpec } from './garmentSpec';
import { getProductionQualityCue, getBrandEnergyCue, getCategoryContext } from './brandProfileMapping';

// ── Styling Resolver ──────────────────────────────────────────────────────────

interface StylingResolution {
  baseLayer?: string;
  bottoms?: string;
  accessories?: string;
  footwear: string;
}

function resolveFootwear(spec: GarmentSpec, modelGender?: string): string {
  const isMale = modelGender === 'Male';
  const type = spec.garment_type.toLowerCase();
  if (/evening dress|occasion dress|cocktail dress|gown/.test(type))
    return 'strappy heeled sandals in a neutral or matching color';
  if (/midi dress|maxi dress|slip dress/.test(type))
    return 'minimal strappy heeled sandals or pointed-toe mules';
  if (/casual dress|summer dress|mini dress/.test(type))
    return 'minimal leather sandals or clean white trainers';
  if (/dress/.test(type))
    return 'minimal heeled sandals or pointed-toe pumps';
  if (/blazer|suit|tailored trouser|trouser/.test(type))
    return isMale ? 'leather loafers or minimal leather dress shoes' : 'pointed-toe leather pumps or classic loafers';
  if (/jacket|coat|bomber|outerwear/.test(type))
    return isMale ? 'leather boots or clean leather loafers' : 'heeled ankle boots or leather loafers';
  if (/skirt/.test(type))
    return 'minimal ankle-strap heels or pointed-toe mules';
  if (/jeans|denim/.test(type))
    return 'clean white trainers or ankle boots';
  if (/activewear|leggings|sports/.test(type))
    return 'clean white or black athletic trainers';
  if (/top|blouse|shirt|tee|t-shirt/.test(type))
    return isMale ? 'clean white trainers or leather loafers' : 'clean white trainers or minimal leather sandals';
  if (/knitwear|sweater|jumper|cardigan/.test(type))
    return 'clean white trainers or ankle boots';
  if (/shorts/.test(type))
    return 'clean white trainers or minimal sandals';
  return isMale ? 'neutral leather loafers or clean trainers' : 'neutral leather loafers or minimal heeled sandals';
}

function resolveStyling(spec: GarmentSpec, modelGender?: string): StylingResolution {
  const isMale = modelGender === 'Male';
  const type = spec.garment_type.toLowerCase();
  const footwear = resolveFootwear(spec, modelGender);
  if (/jacket|coat|bomber|outerwear|blazer/.test(type)) {
    const baseColor = spec.primary_colors.some(c => /black/i.test(c)) ? 'white' : 'black';
    return {
      baseLayer: `a simple fitted ${baseColor} top underneath the ${spec.garment_type}`,
      bottoms: isMale
        ? 'slim-fit tailored dark trousers'
        : 'tailored trousers in a neutral tone',
      accessories: isMale ? undefined : 'minimal delicate jewelry',
      footwear,
    };
  }
  if (/skirt/.test(type))
    return { baseLayer: 'a fitted neutral top tucked into the skirt', footwear };
  if (/dress/.test(type))
    return { accessories: 'minimal delicate gold or silver jewelry', footwear };
  if (/trouser|jeans|pants/.test(type))
    return { baseLayer: 'a fitted top tucked in or slightly cropped to show the waistband', footwear };
  if (/top|blouse|shirt|tee|t-shirt/.test(type))
    return {
      bottoms: isMale
        ? 'dark slim-fit jeans or chinos'
        : 'high-waisted tailored trousers or slim-fit jeans',
      footwear,
    };
  if (/knitwear|sweater|jumper|cardigan/.test(type))
    return {
      bottoms: isMale
        ? 'dark slim-fit jeans or tailored trousers'
        : 'high-waisted tailored trousers or slim-fit jeans',
      footwear,
    };
  return { footwear };
}

function buildStylingBlock(styling: StylingResolution): string {
  const lines = [
    'STYLING (fashion e-commerce standard):',
    'This is a professional fashion ecommerce product photo matching the quality of premium retail brands such as Mango, Zara, and COS.',
    'The hero garment is the sole focus. Complementary styling completes the look without distracting from it:',
  ];
  if (styling.baseLayer) lines.push(`- Base layer: ${styling.baseLayer}.`);
  if (styling.bottoms) lines.push(`- Bottoms: The model is wearing ${styling.bottoms}. Must be visible and naturally styled.`);
  if (styling.accessories) lines.push(`- Accessories: ${styling.accessories}. Keep subtle.`);
  lines.push(`- Footwear: The model is wearing ${styling.footwear}. Shoes must be fully visible and naturally styled with the outfit.`);
  lines.push('- No bold colors or busy patterns in any complementary pieces. Everything supports the hero garment.');
  return lines.join('\n');
}

/** Condensed styling block for 3/4 and back poses — reinforces outfit consistency without re-describing the full look. */
function buildOutfitConsistencyBlock(styling: StylingResolution): string {
  const parts: string[] = [];
  if (styling.bottoms) parts.push(`Bottoms: ${styling.bottoms}`);
  if (styling.baseLayer) parts.push(`Base layer: ${styling.baseLayer}`);
  parts.push(`Footwear: ${styling.footwear}`);
  return `\nOUTFIT CONSISTENCY: ${parts.join('. ')}. Match these exactly from the front result — do not change or invent complementary pieces.`;
}

/**
 * Garment-fidelity prompt for "flat lay → dressed model" flow.
 * Used with Nano Banana 2 (Gemini 3.1 Flash Image). The garment in the output
 * must match the flat lay exactly (detail-lock: buttons, zippers, logos, etc.).
 *
 * Image count varies (2–4) depending on options:
 *   - Front flat lay only:                    2 images → flat lay + model ref
 *   - Front + back flat lay:                  3 images → front + back + model ref
 *   - Front flat lay + length anchor:         3 images → flat lay + model ref + anchor
 *   - Front + back flat lay + length anchor:  4 images → front + back + model ref + anchor
 */
/**
 * Builds the header dynamically based on how many images are provided.
 * Image order in the API call must match the numbering here:
 *   [flat lay front, (flat lay back?), model ref, (length anchor?)]
 */
function buildHeader(hasBackFlatLay: boolean, hasLengthAnchor: boolean): string {
  let n = 1;
  const frontIdx = n++;
  const backIdx = hasBackFlatLay ? n++ : null;
  const modelIdx = n++;
  const anchorIdx = hasLengthAnchor ? n++ : null;
  const total = n - 1;

  const lines: string[] = [];
  lines.push(`You are given ${total} image${total > 1 ? 's' : ''}:`);
  lines.push(`${frontIdx}) A flat lay product photo showing the FRONT of the garment. This is the ${hasBackFlatLay ? 'primary garment reference for front-facing and three-quarter poses' : 'SOLE source for the garment — take ALL clothing details exclusively from this image'}.`);
  if (backIdx) {
    lines.push(`${backIdx}) A flat lay photo showing the BACK of the garment. This is the primary garment reference for back-facing poses.`);
  }
  lines.push(`${modelIdx}) A reference photo of a fashion model (full body). This is the SOLE source for the person — take ONLY the model's identity from this image.`);
  if (anchorIdx) {
    lines.push(`${anchorIdx}) A LENGTH ANCHOR image: the front-view result of this model already wearing this garment. Use this STRICTLY as a length and fit reference — do NOT copy the pose or angle from this image.`);
  }

  const garmentSource = hasBackFlatLay
    ? `images ${frontIdx} and ${backIdx}`
    : `image ${frontIdx}`;

  lines.push('');
  lines.push(`TASK: Perform a garment transfer. Generate a new image of the EXACT same person from image ${modelIdx}, wearing the EXACT garment from ${garmentSource}.${hasBackFlatLay ? ' Both flat lay images show the SAME garment — use both to understand the full design (e.g. if the back has a different pattern, zipper, or cutout, preserve that).' : ''} The garment must be placed naturally on the model's body for the requested pose.`);

  return lines.join('\n');
}

const LENGTH_ANCHOR_SECTION = `

LENGTH ANCHOR (critical — garment sizing consistency):
- A front-view image of this model already wearing this garment is included as a length and fit reference.
- The garment hem MUST end at the EXACT same point on the legs as shown in the length anchor image. If the hem is above the knee in the anchor, it must be above the knee at the same point in this pose. If below the knee, same.
- Match the garment's tightness/looseness of fit as shown in the anchor.
- Do NOT copy the pose, angle, expression, or framing from the anchor image — ONLY use it for garment length and fit.`;

const GARMENT_FIDELITY_BODY = `

IDENTITY PRESERVATION (critical — do not alter the person):
- Strictly preserve the model's identity from the reference image: same face, same facial features, same skin tone, same skin texture and pores, same body proportions, same body physique, same hair length, same hair style, same hair color, same expression.
- Do not change, age, or alter the person in any way. The output must be unmistakably the same individual.
- Take NOTHING about the person from the flat lay image(s). The flat lay is ONLY for the garment. The model reference is ONLY for the person.

WHAT TO TAKE FROM THE MODEL REFERENCE IMAGE (and ONLY from this image):
- Face, facial expression, skin tone, skin texture, pores
- Body proportions, body physique, height, pose
- Hair length, hair style, hair color
- No jewelry unless present in the reference

WHAT TO TAKE FROM THE FLAT LAY IMAGE(S) (and ONLY from these images):
- The garment: color, pattern, print, texture, fabric
- All garment details: buttons, zippers, logos, labels, stitching, hardware, pockets, seams
- Garment length, neckline, sleeve length, hem — exactly as shown

GARMENT FIDELITY (critical — do not alter the garment):
- Copy the garment from the flat lay exactly: same color, pattern, print, and texture.
- Preserve all visible details: buttons, zippers, logos, labels, stitching, hardware, pockets, seams.
- Do not add or remove design elements. Do not change neckline, sleeve length, or hem.
- Preserve the garment's length and hem exactly as in the flat lay; do not shorten, crop, or lengthen the item. The garment must end at the same point on the body across all poses.
- Fabric must look the same (e.g. denim, knit, satin) as in the flat lay.

{{STYLING_SNIPPET}}
- Never invent patterns, logos, or text that are not in the flat lay. Complementary pieces must not distract from the hero garment.

NATURAL WEAR (critical — must look actually worn, not pasted on):
- The garment must drape and conform to the model's body: follow the curves of shoulders, chest, arms, waist, and hips. It must look worn, not digitally composited or floating.
- Show realistic fabric behavior: subtle folds, creases, and tension where the body bends or where the fit is snug or loose (e.g. under bust, at elbows, around waist, underarms). Avoid stiff, perfectly smooth fabric with no natural wrinkles.
- Patterns (stripes, prints, plaids) must follow the 3D surface naturally: they should curve and flow with the body. Do not stretch or warp the pattern unnaturally; preserve stripe width and alignment as they would appear on real fabric worn on a real person.
- Pay special attention to shoulders and underarms: the garment should wrap around the body there, not look flat or detached. Sleeves and hems should hang or sit naturally.

POSE & FRAMING:
{{ANGLE_SNIPPET}}
- Full body from head to toe. Leave clear space above the head and below the feet. Do not crop the head or feet; the entire body must be visible.
- 2:3 portrait framing. Center the model with even margins on all sides.
- Match the reference model's pose and angle only; use consistent, centered framing with similar margins (do not copy tight or loose crop from the reference).
{{STYLE_SNIPPET}}

Output: One photorealistic image in the style of professional fashion ecommerce photography from a premium retail brand. High resolution, sharp details. The person must be unmistakably the same as in the reference — same face, same skin, same body. The only change is the clothing, which must match the flat lay garment exactly. The garment must look like real clothing actually worn in a studio shot — natural drape, realistic folds, consistent length across poses, no pasted-on or stiff appearance.`;

/**
 * Builds the full garment-fidelity prompt for one pose, with angle and PDP style
 * snippets injected.
 *
 * @param hasBackFlatLay  true when a back flat lay image is included
 * @param hasLengthAnchor true when a front-result image is included as a length/fit anchor
 */
export function generateGarmentFidelityPrompt(
  anglePreset: AnglePreset,
  stylePreset: PdpStylePreset,
  hasBackFlatLay = false,
  hasLengthAnchor = false,
  spec?: GarmentSpec,
  modelGender?: string,
): string {
  const header = buildHeader(hasBackFlatLay, hasLengthAnchor);
  const anchor = hasLengthAnchor ? LENGTH_ANCHOR_SECTION : '';
  const styling = spec
    ? buildStylingBlock(resolveStyling(spec, modelGender))
    : 'STYLING (fashion e-commerce standard):\nThis is a professional fashion ecommerce product photo. Add appropriate footwear and style the model for a premium retail brand shoot.';
  return (header + GARMENT_FIDELITY_BODY + anchor)
    .replace('{{ANGLE_SNIPPET}}', anglePreset.promptSnippet)
    .replace('{{STYLE_SNIPPET}}', stylePreset.promptSnippet)
    .replace('{{STYLING_SNIPPET}}', styling);
}

/** Pose identifiers for the multi-turn chat flow (no anchor). */
export type SpecPose = 'front' | 'three-quarter' | 'back';

/**
 * Camera geometry constants — defined once per angle, shared across all brand styles.
 * These describe WHERE the camera is, not how the model stands.
 * Body language (stance, arms, expression) lives in BrandStylePreset snippets.
 */
export const POSE_GEOMETRY: Record<SpecPose, string> = {
  front: 'Camera directly in front of the model, at eye level.',
  'three-quarter': "Camera positioned 45° to the model's right, at eye level. Model stands naturally facing forward — camera captures left shoulder and left side of torso closest to lens.",
  back: "Camera positioned directly behind the model, at eye level. Model's back fully visible.",
};

const FRAMING_BLOCK =
  'Full body from head to toe. Do not crop the head or feet; the entire body must be visible. 2:3 portrait framing. Center the model with even margins on all sides.';

/** Length + lighting rules: front flat lay is source of truth for hem; match reference lighting. */
function lengthAndLightingBlock(spec: GarmentSpec, hasBackFlatLay: boolean, pose: SpecPose, backdropSnippet: string): string {
  const lengthLine = `Hem length (source of truth): ${spec.hem_length}, from the front flat lay only. Use this exact length for this pose.`;
  const backNote =
    pose === 'back' && hasBackFlatLay
      ? ' If a back flat lay is provided, use it only for back design details (e.g. neckline, zipper); do not use it for garment length.'
      : '';
  const lightingLine = `${backdropSnippet} Keep lighting identical across all poses.`;
  return `${lengthLine}${backNote} ${lightingLine}`;
}

/**
 * Build a short structured prompt from garment spec for one pose.
 * Used in multi-turn chat: turn 1 = front (with images), turn 2 = three-quarter, turn 3 = back.
 * @param hasBackFlatLay when true and pose is back, instructs to use back flat lay only for design, not length
 * @param brandStyle optional brand style preset — body language snippets resolved by modelGender (Male uses frontSnippetMale/energyCueMale when present)
 * @param modelGender when 'Male', uses frontSnippetMale/energyCueMale when present; else uses frontSnippet/energyCue
 */
export function buildPromptFromSpec(
  spec: GarmentSpec,
  pose: SpecPose,
  styleSnippet: string,
  hasBackFlatLay = false,
  hasLengthAnchor = false,
  modelHeight?: string,
  brandStyle?: BrandStylePreset,
  modelGender?: string,
  pricePoint?: string,
  brandEnergy?: string,
  primaryCategory?: string,
): string {
  const preset = brandStyle;
  const effectiveFrontSnippet =
    modelGender === 'Male' && preset?.frontSnippetMale
      ? preset.frontSnippetMale
      : preset?.frontSnippet;
  const effectiveEnergyCue =
    modelGender === 'Male' && preset?.energyCueMale
      ? preset.energyCueMale
      : preset?.energyCue;
  const effectiveThreeQuarterSnippet =
    modelGender === 'Male' && preset?.threeQuarterSnippetMale
      ? preset.threeQuarterSnippetMale
      : preset?.threeQuarterSnippet;
  const effectiveBackSnippet =
    modelGender === 'Male' && preset?.backSnippetMale
      ? preset.backSnippetMale
      : preset?.backSnippet;

  const colors = spec.primary_colors.length ? spec.primary_colors.join(' ') : 'neutral';
  const heightNote = modelHeight ? ` The model is ${modelHeight} tall.` : '';
  const qualityCue = getProductionQualityCue(pricePoint);
  const brandMoodCue = getBrandEnergyCue(brandEnergy);
  const categoryCue = getCategoryContext(primaryCategory);
  const brandProfileBlock = [brandMoodCue, categoryCue].filter(Boolean).join('\n');
  const brandPrefix = brandProfileBlock ? `${brandProfileBlock}\n\n` : '';
  const base = `${qualityCue}\n\n${brandPrefix}Photo of the person in the reference image wearing a ${colors} ${spec.fit}-fit ${spec.silhouette} ${spec.garment_type}, ${spec.sleeve_length} sleeves, hem ${spec.hem_length}${spec.notable_details ? `, ${spec.notable_details}` : ''}.${heightNote}`;
  const effectiveBackdrop = brandStyle?.backdropSnippet ?? styleSnippet;
  const tail = lengthAndLightingBlock(spec, hasBackFlatLay, pose, effectiveBackdrop);

  const styling = resolveStyling(spec, modelGender);

  if (pose === 'front') {
    const poseInstruction = effectiveFrontSnippet ?? 'Standing naturally, neutral pose, arms relaxed at sides.';
    return `${base} ${POSE_GEOMETRY.front} ${poseInstruction} Full body, ${effectiveBackdrop}. ${FRAMING_BLOCK} ${tail}\n\n${buildStylingBlock(styling)}`;
  }

  // For turns 2/3, prepend an image enumeration header.
  // The front result is included as an OUTFIT CONSISTENCY anchor — it tells Gemini
  // what complementary pieces (trousers, shoes, base layer) the model is wearing.
  // Without it, Gemini invents the bottom half (shorts, wrong trousers, etc.).
  // Pose bias is controlled by the text primer, camera-centric POSE_GEOMETRY, and
  // the explicit "do NOT copy pose" instruction on the anchor image.
  let imageHeader = '';
  const isBackWithBackFlatLay = pose === 'back' && hasBackFlatLay;
  const img1Desc = isBackWithBackFlatLay
    ? 'The BACK flat lay garment photo — source for back garment details (neckline, zipper, back design). Do NOT use this for garment length.'
    : 'The FRONT flat lay garment photo — source for garment details.';
  if (hasLengthAnchor) {
    imageHeader =
      `You are given 3 images:\n` +
      `1) ${img1Desc}\n` +
      `2) A reference photo of the model — source for identity ONLY (face, skin tone, hair, body proportions). Do NOT copy the pose, stance, body angle, or arm positions from this image.\n` +
      `3) A front-view result of this model already wearing this garment — use this STRICTLY for OUTFIT CONSISTENCY: match the exact same complementary pieces (trousers, shoes, base layer), garment length, and fit. The garment hem MUST end at the same point on the body. Do NOT copy the pose, body angle, arm positions, or camera angle from this image.\n\n`;
  } else {
    imageHeader =
      `You are given 2 images:\n` +
      `1) ${img1Desc}\n` +
      `2) A reference photo of the model — source for identity ONLY (face, skin tone, hair, body proportions). Do NOT copy the pose, stance, body angle, or arm positions from this image.\n\n`;
  }

  const energyCue = effectiveEnergyCue ? ` ${effectiveEnergyCue}` : '';
  const outfitBlock = buildOutfitConsistencyBlock(styling);

  if (pose === 'three-quarter') {
    const bodyLanguage = effectiveThreeQuarterSnippet
      ?? `Natural stance, face turned toward camera.${energyCue}`;
    return `${imageHeader}Same person, same garment. ${POSE_GEOMETRY['three-quarter']} ${bodyLanguage} Same length and fit. ${FRAMING_BLOCK} ${tail}${outfitBlock}`;
  }
  const bodyLanguage = effectiveBackSnippet
    ?? `Head turned to one side looking over shoulder, profile visible.${energyCue}`;
  return `${imageHeader}Same person, same garment. ${POSE_GEOMETRY.back} ${bodyLanguage} Same length and fit. ${FRAMING_BLOCK} ${tail}${outfitBlock}`;
}
