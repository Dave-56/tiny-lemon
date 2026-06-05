import type { PdpStylePreset, AnglePreset, BrandStylePreset } from './types';
import type { GarmentSpec } from './garmentSpec';
import type { GraphicFidelityPromptContext } from './graphicFidelity';

// ── Styling Resolver ──────────────────────────────────────────────────────────

interface StylingResolution {
  baseLayer?: string;
  bottoms?: string;
  accessories?: string;
  footwear: string;
}

// ── Gender Lock ───────────────────────────────────────────────────────────────

/**
 * Returns a terse gender lock sentence when modelGender is 'Male' or 'Female'.
 * Else returns an empty string. Includes a trailing space so it can be inlined
 * before camera geometry for the front pose.
 */
export function getGenderLock(modelGender?: string): string {
  if (modelGender === 'Male') {
    return 'The person is male; do not alter sex or gender presentation. Do not generate a female-presenting person. ';
  }
  if (modelGender === 'Female') {
    return 'The person is female; do not alter sex or gender presentation. Do not generate a male-presenting person. ';
  }
  return '';
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
  return `\nOUTFIT CONSISTENCY: ${parts.join('. ')}. Keep these complementary pieces consistent across poses without changing the hero garment.`;
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
  const genderLock = getGenderLock(modelGender);
  const styling = spec
    ? buildStylingBlock(resolveStyling(spec, modelGender))
    : 'STYLING (fashion e-commerce standard):\nThis is a professional fashion ecommerce product photo. Add appropriate footwear and style the model for a premium retail brand shoot.';
  // Inject genderLock immediately after the header so it scopes the whole prompt.
  const prefix = genderLock ? header + genderLock + '\n' : header;
  return (prefix + GARMENT_FIDELITY_BODY + anchor)
    .replace('{{ANGLE_SNIPPET}}', anglePreset.promptSnippet)
    .replace('{{STYLE_SNIPPET}}', stylePreset.promptSnippet)
    .replace('{{STYLING_SNIPPET}}', styling);
}

/** Pose identifiers for the multi-turn chat flow (no anchor). */
export type SpecPose = 'front' | 'three-quarter' | 'back';

export type GarmentReferenceContext = {
  primaryImageSide?: 'front' | 'back';
  frontDescription?: string;
  backDescription?: string;
  generationDirection?: string;
};

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

const HAND_SAFETY_BLOCK =
  'Hand safety (critical): Keep hands fully visible and clearly shaped. Keep hands away from the torso, waistband, pockets, and hem. Do not let hands touch or cover the garment. Fingers must look natural and separated. No distorted fingers, fused hands, or hidden hands unless intentionally requested.';

const DEFAULT_POSE_INSTRUCTIONS: Record<SpecPose, string> = {
  front:
    'Standing naturally with weight balanced and posture relaxed. Both arms rest naturally at the sides with a small visible gap from the torso. Both hands fully visible, fingers natural, not touching clothing.',
  'three-quarter':
    'Simple natural catalog stance. Feet are placed comfortably and realistically, knees relaxed, no exaggerated hip drop or crossed legs. Both arms remain relaxed with a clear gap from the torso. Hands stay fully visible and away from the waistband and garment.',
  back:
    'Standing naturally from the rear angle with feet placed comfortably and realistically. Arms relaxed slightly away from the body. Hands remain visible from the rear angle when possible, with fingers natural and away from the garment.',
};

const FRAMING_BLOCK =
  'Full body from head to toe. Do not crop the head or feet; the entire body must be visible. 2:3 portrait framing. Center the model with even margins on all sides.';

const RELAXED_QUALITY_CUE =
  'Professional fashion e-commerce photography. Clean studio image, natural catalog posture, realistic body proportions, and a clear readable view of the garment.';

function buildGraphicFidelityCue(
  spec: GarmentSpec,
  graphicFidelity?: GraphicFidelityPromptContext,
): string {
  const isCritical = graphicFidelity ? graphicFidelity.critical : spec.has_logo_or_text;
  if (!isCritical) return '';
  const detail = graphicFidelity?.description ?? spec.notable_details;
  const detailText = detail
    ? ` Visible graphic/text detail: ${detail}.`
    : '';
  const referenceText = graphicFidelity?.hasReferenceCrop
    ? ' A close-up reference crop of the graphic/print is provided as an additional image. Use that crop as the exact visual source for the graphic details.'
    : '';
  const rawReferenceText = graphicFidelity?.hasRawReference
    ? ' The original merchant upload is also provided as an additional reference; use it to recover graphic details that cleanup may have softened.'
    : '';
  return ` Graphic/text fidelity is critical.${detailText}${rawReferenceText}${referenceText} Preserve the exact placement, scale, color, spacing, and legibility of every printed graphic, logo, label, letter, number, and word from the flat lay. Do not redraw, paraphrase, mirror, scramble, stylize, replace, or invent any graphics or text.`;
}

const STYLE_DIRECTION_CUES: Record<string, string> = {
  minimal:
    'STYLE DIRECTION (visual only): Minimal Clarity. Neutral studio catalog image with matte grey balance, crisp garment edges, low contrast, and no decorative styling. Keep the pose, gaze, expression, and hand placement controlled by the pose instructions only.',
  accessible:
    'STYLE DIRECTION (visual only): Accessible Warmth. Bright clean retail image with soft warm light, approachable commercial polish, and gentle color temperature. Do not add a smile, hip shift, or playful posture unless it exists in the model reference.',
  premium:
    'STYLE DIRECTION (visual only): Premium Poise. Warm off-white studio image with refined diffused lighting, subtle material richness, quiet luxury polish, and soft contact shadows. Keep the pose neutral; do not add crossed arms, pockets, or dramatic editorial attitude.',
  street:
    'STYLE DIRECTION (visual only): Street Aesthetic. Cool grey studio image with slightly crisper contrast, utilitarian retail polish, and understated urban styling. Express the street feel through background tone and lighting only; do not add slouching, strong weight shifts, pockets, or deadpan pose choreography.',
  athletic:
    'STYLE DIRECTION (visual only): Athletic Performance. Bright white studio image with clean functional activewear polish, crisp detail, and fresh even light. Keep it catalog-safe; do not add stride, forward lean, flexing, core tension, or performance-action posture.',
};

function buildStyleDirectionBlock(brandStyle?: BrandStylePreset): string {
  if (!brandStyle) return '';
  return STYLE_DIRECTION_CUES[brandStyle.id] ?? '';
}

function buildGenerationDirectionBlock(referenceContext?: GarmentReferenceContext): string {
  const direction = referenceContext?.generationDirection?.trim();
  if (!direction) return '';
  return `MERCHANT SHOOT DIRECTION (styling/background/mood only): ${direction}. Apply this direction consistently across the full generated image set. Preserve the actual garment color, graphics, text, fit, silhouette, and product details from the uploaded product reference. Do not alter the product unless the direction explicitly describes safe surrounding styling.`;
}

function getNotableDetailsForPose(
  spec: GarmentSpec,
  pose: SpecPose,
  referenceContext?: GarmentReferenceContext,
): string {
  const frontDescription = referenceContext?.frontDescription?.trim();
  const backDescription = referenceContext?.backDescription?.trim();
  const details = spec.notable_details?.trim();

  if (pose === 'back') {
    if (referenceContext?.primaryImageSide === 'front' && backDescription) return backDescription;
    return details ?? '';
  }

  if (referenceContext?.primaryImageSide === 'back') {
    return frontDescription ?? '';
  }

  return details ?? '';
}

/** Length + lighting rules: front flat lay is source of truth for hem; match reference lighting. */
function lengthAndLightingBlock(
  spec: GarmentSpec,
  hasBackFlatLay: boolean,
  pose: SpecPose,
  backdropSnippet: string,
  referenceContext?: GarmentReferenceContext,
): string {
  const source = referenceContext?.primaryImageSide === 'back'
    ? 'from the product reference photo and merchant front description'
    : 'from the front flat lay only';
  const lengthLine = `Hem length (source of truth): ${spec.hem_length}, ${source}. Use this exact length for this pose.`;
  const backNote =
    pose === 'back' && hasBackFlatLay
      ? ' If a back flat lay is provided, use it only for back design details (e.g. neckline, zipper); do not use it for garment length.'
      : '';
  const lightingLine = `${backdropSnippet} Keep lighting identical across all poses.`;
  return `${lengthLine}${backNote} ${lightingLine}`;
}

/**
 * Build a short structured prompt from garment spec for one pose.
 * Used by independent image-generation calls for each pose.
 * @param hasBackFlatLay when true and pose is back, instructs to use back flat lay only for design, not length
 * @param brandStyle optional brand style preset — used for backdrop only in the relaxed prompt profile
 * @param modelGender used only for gender lock and conservative styling choices
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
  _pricePoint?: string,
  _brandEnergy?: string,
  _primaryCategory?: string,
  referenceContext?: GarmentReferenceContext,
  graphicFidelity?: GraphicFidelityPromptContext,
): string {
  void _pricePoint;
  void _brandEnergy;
  void _primaryCategory;

  const colors = spec.primary_colors.length ? spec.primary_colors.join(' ') : 'neutral';
  const heightNote = modelHeight ? ` The model is ${modelHeight} tall.` : '';
  const graphicFidelityCue = buildGraphicFidelityCue(spec, graphicFidelity);
  const poseDetails = getNotableDetailsForPose(spec, pose, referenceContext);
  const base = `${RELAXED_QUALITY_CUE}\n\nPhoto of the person in the reference image wearing a ${colors} ${spec.fit}-fit ${spec.silhouette} ${spec.garment_type}, ${spec.sleeve_length} sleeves, hem ${spec.hem_length}${poseDetails ? `, ${poseDetails}` : ''}.${heightNote}${graphicFidelityCue}`;
  const effectiveBackdrop = brandStyle?.backdropSnippet ?? styleSnippet;
  const styleDirection = buildStyleDirectionBlock(brandStyle);
  const generationDirection = buildGenerationDirectionBlock(referenceContext);
  const tail = lengthAndLightingBlock(spec, hasBackFlatLay, pose, effectiveBackdrop, referenceContext);

  const styling = resolveStyling(spec, modelGender);
  const genderLock = getGenderLock(modelGender);
  const missingFrontBlock =
    referenceContext?.primaryImageSide === 'back' && referenceContext.frontDescription
      ? `\n\nMISSING FRONT REFERENCE (merchant supplied): The uploaded product photo is the BACK of the garment, not the front. Generate the front-facing view using this front description as the source of truth for visible front details: ${referenceContext.frontDescription}. Keep any shared material, color, fit, sleeve length, and hem consistent with the uploaded back photo. Do not copy back-only graphics, labels, or closures onto the front unless the description says they also appear on the front. If a back graphic reference exists, treat it as back-only and do not place it on the front.`
      : '';
  const missingBackBlock =
    pose === 'back' && !hasBackFlatLay && referenceContext?.backDescription
      ? `\n\nMISSING BACK REFERENCE (merchant supplied): No back photo was uploaded. Generate the back-facing view using this back description as the source of truth for visible back details: ${referenceContext.backDescription}. Keep shared material, color, fit, sleeve length, and hem consistent with the front flat lay. Do not copy front-only graphics, labels, or closures onto the back unless the description says they also appear on the back.`
      : '';

  if (pose === 'front') {
    const poseInstruction = DEFAULT_POSE_INSTRUCTIONS.front;
    // Inject gender lock after base and before camera geometry.
    return `${base}${missingFrontBlock} ${genderLock}${styleDirection ? `${styleDirection} ` : ''}${generationDirection ? `${generationDirection} ` : ''}${POSE_GEOMETRY.front} ${poseInstruction} ${HAND_SAFETY_BLOCK} Full body, ${effectiveBackdrop}. ${FRAMING_BLOCK} ${tail}\n\n${buildStylingBlock(styling)}`;
  }

  // For non-front poses, prepend an image enumeration header. The relaxed prompt
  // keeps outfit consistency in text instead of passing the generated front image
  // as a visual anchor, because that can leak front-pose stance into later views.
  let imageHeader = '';
  const isBackWithBackFlatLay = pose === 'back' && hasBackFlatLay;
  const img1Desc = referenceContext?.primaryImageSide === 'back'
    ? 'The BACK flat lay garment photo — source for back garment details, shared material, color, fit, sleeve length, and hem. Front details come from the merchant front description.'
    : isBackWithBackFlatLay
    ? 'The BACK flat lay garment photo — source for back garment details (neckline, zipper, back design). Do NOT use this for garment length.'
    : 'The FRONT flat lay garment photo — source for garment details.';
  const hasRawGraphicReference = Boolean(graphicFidelity?.critical && graphicFidelity.hasRawReference);
  const hasGraphicReferenceCrop = Boolean(graphicFidelity?.critical && graphicFidelity.hasReferenceCrop);
  const imageDescriptions = [img1Desc];
  if (hasRawGraphicReference) {
    imageDescriptions.push('The original merchant upload — source for raw graphic/logo/text details if cleanup softened them. Use only garment details from this image, not its background, hanger, mannequin, or body pose.');
  }
  if (hasGraphicReferenceCrop) {
    imageDescriptions.push('A close-up crop of the garment graphic, logo, print, or typography — source for exact graphic details ONLY.');
  }
  imageDescriptions.push('A reference photo of the model — source for identity ONLY (face, skin tone, hair, body proportions). Do NOT copy the pose, stance, body angle, or arm positions from this image.');
  if (hasLengthAnchor) {
    imageDescriptions.push('A front-view result of this model already wearing this garment — use this STRICTLY as a BACKGROUND, LIGHTING, and OUTFIT CONSISTENCY anchor. Match the exact same backdrop color/gradient, floor tone, contact shadow softness, lighting direction, complementary pieces (trousers, shoes, base layer), garment length, and fit. The garment hem MUST end at the same point on the body. Do NOT copy the pose, body angle, arm positions, or camera angle from this image.');
  }
  imageHeader =
    `You are given ${imageDescriptions.length} images:\n` +
    imageDescriptions.map((description, index) => `${index + 1}) ${description}`).join('\n') +
    '\n\n';

  const outfitBlock = buildOutfitConsistencyBlock(styling);

  if (pose === 'three-quarter') {
    const bodyLanguage = DEFAULT_POSE_INSTRUCTIONS['three-quarter'];
    // Insert gender lock immediately after imageHeader so it scopes turns 2/3.
    const headerWithLock = genderLock ? `${imageHeader}${genderLock}\n` : imageHeader;
    return `${headerWithLock}${styleDirection ? `${styleDirection}\n` : ''}${generationDirection ? `${generationDirection}\n` : ''}${missingFrontBlock}${graphicFidelityCue}\nSame person, same garment. ${POSE_GEOMETRY['three-quarter']} ${bodyLanguage} ${HAND_SAFETY_BLOCK} Same length and fit. ${FRAMING_BLOCK} ${tail}${outfitBlock}`;
  }
  const bodyLanguage = DEFAULT_POSE_INSTRUCTIONS.back;
  const headerWithLock = genderLock ? `${imageHeader}${genderLock}\n` : imageHeader;
  return `${headerWithLock}${styleDirection ? `${styleDirection}\n` : ''}${generationDirection ? `${generationDirection}\n` : ''}${missingFrontBlock}${missingBackBlock}${graphicFidelityCue}\nSame person, same garment. ${POSE_GEOMETRY.back} ${bodyLanguage} ${HAND_SAFETY_BLOCK} Same length and fit. ${FRAMING_BLOCK} ${tail}${outfitBlock}`;
}
