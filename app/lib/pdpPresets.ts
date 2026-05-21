import type { PdpStylePreset, AnglePreset, BrandStylePreset } from './types';

/**
 * PDP style presets. First item is the default (White Studio).
 * Do not reorder without updating default resolution in App.
 */
export const PDP_STYLE_PRESETS: PdpStylePreset[] = [
  {
    id: 'white-studio',
    label: 'White / clean studio',
    imageUrl: '/presets/backgrounds/white-studio.png',
    description: 'Pure or near-white background, soft even light. Classic product look, works for most retailers (e.g. ASOS, Zara). Very safe and versatile.',
    promptSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette, no grey tones, no color shift anywhere in the frame. The floor is the same seamless white sweep as the wall with no visible horizon line or studio edges. Very soft contact shadow directly under the feet only. Soft, even studio lighting with no harsh shadows on the garment or body.',
  },
  {
    id: 'grey-studio',
    label: 'Grey / neutral studio',
    imageUrl: '/presets/backgrounds/grey-studio.png',
    description: 'Light grey or neutral backdrop, soft shadows. Feels a bit more premium than pure white, still very "shop" and on-model.',
    promptSnippet: 'Background: neutral light grey seamless studio sweep (#CCCCCC–#E0E0E0). Flat, even grey tone — no gradient, no vignette, no color shift. The floor is the same seamless grey sweep as the wall with no visible horizon line. Very soft contact shadow directly under the feet only. Soft, even studio lighting with no harsh shadows on the garment or body.',
  },
  // Supported later — start small with White + Grey only
  // {
  //   id: 'gradient-sweep',
  //   label: 'Gradient Sweep',
  //   description: 'Seamless gradient background (e.g. light grey to white). No hard floor line, minimal distraction. Modern, premium e-commerce look.',
  //   promptSnippet: 'Background: subtle gradient sweep (light grey to white or soft tone). Even, flattering studio lighting. Modern e-commerce style.',
  // },
  // {
  //   id: 'lifestyle',
  //   label: 'Lifestyle',
  //   description: 'Model in a real-world setting (café, street, room). Good for brand storytelling and vibe; stronger on social than pure product.',
  //   promptSnippet: 'Background: contextual lifestyle setting (e.g. minimal interior, soft natural light). Relaxed, aspirational mood. Lifestyle product shot.',
  // },
  // {
  //   id: 'editorial',
  //   label: 'Editorial',
  //   description: 'Styled lighting, stronger shadows, magazine feel. Best for hero and campaign imagery when you want a bold, high-fashion look.',
  //   promptSnippet: 'Background: editorial style (dramatic lighting, slight shadow, high contrast). Fashion editorial photography. Bold, magazine-quality look.',
  // },
];

/**
 * Brand style presets. The active generator keeps body pose centralized in
 * garmentFidelityPrompt and uses these presets primarily for visual styling:
 * background, light quality, contrast, polish, and retail mood.
 *
 * The legacy body-language fields remain for UI/type compatibility, but their
 * contents should stay pose-safe: no hip choreography, smiles, pockets, crossed
 * arms, action stance, or gaze instructions that can fight the shared pose layer.
 */
export const BRAND_STYLE_PRESETS: BrandStylePreset[] = [
  {
    id: 'minimal',
    label: 'Minimal Clarity',
    imageUrl: '/presets/styling/minimal.png',
    description: 'The clean control case: neutral grey studio, crisp garment readability, low-distraction catalog polish. Brands like COS, Uniqlo, Arket.',
    frontSnippet: 'Pose-safe minimal catalog direction: neutral stance, visible relaxed hands, clear garment readability, no added expression or choreography.',
    energyCue: 'Minimal catalog clarity, neutral retail energy, no added pose choreography.',
    frontSnippetMale: 'Pose-safe minimal catalog direction: neutral stance, visible relaxed hands, clear garment readability, no added expression or choreography.',
    energyCueMale: 'Minimal catalog clarity, neutral retail energy, no added pose choreography.',
    threeQuarterSnippet: 'Pose-safe minimal catalog direction: simple stance, visible hands, clear garment readability, no added weight shift or gaze choreography.',
    threeQuarterSnippetMale: 'Pose-safe minimal catalog direction: simple stance, visible hands, clear garment readability, no added weight shift or gaze choreography.',
    backSnippet: 'Pose-safe minimal catalog direction: natural rear view, visible hands when possible, clear garment readability, no head-turn choreography.',
    backSnippetMale: 'Pose-safe minimal catalog direction: natural rear view, visible hands when possible, clear garment readability, no head-turn choreography.',
    backdropSnippet: 'Background: neutral light grey seamless studio sweep (#E0E0E0). Flat, even grey tone — no gradient, no vignette, no color shift. Seamless grey sweep floor and wall with no visible horizon line. Very soft contact shadow under feet only. Soft, even studio lighting with low contrast and crisp garment edges.',
  },
  {
    id: 'accessible',
    label: 'Accessible Warmth',
    imageUrl: '/presets/styling/accessible.png',
    description: 'Approachable retail warmth through light and color, not pose. Clean, friendly, non-intimidating. Brands like H&M, ASOS, Next.',
    frontSnippet: 'Pose-safe accessible direction: warm commercial polish, visible relaxed hands, neutral catalog stance, no added smile or hip choreography.',
    energyCue: 'Accessible warmth through light and color only; no added smile, hip shift, or pose choreography.',
    frontSnippetMale: 'Pose-safe accessible direction: warm commercial polish, visible relaxed hands, neutral catalog stance, no added smile or hip choreography.',
    energyCueMale: 'Accessible warmth through light and color only; no added smile, hip shift, or pose choreography.',
    threeQuarterSnippet: 'Pose-safe accessible direction: warm retail polish, visible hands, simple catalog stance, no smile or shifted-hip choreography.',
    threeQuarterSnippetMale: 'Pose-safe accessible direction: warm retail polish, visible hands, simple catalog stance, no smile or shifted-hip choreography.',
    backSnippet: 'Pose-safe accessible direction: warm clean rear view, visible hands when possible, no smile or head-turn choreography.',
    backSnippetMale: 'Pose-safe accessible direction: warm clean rear view, visible hands when possible, no smile or head-turn choreography.',
    backdropSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette, no grey tones. Seamless white sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft warm studio lighting with gentle commercial brightness and natural skin tone.',
  },
  {
    id: 'editorial',
    label: 'Editorial Cool',
    imageUrl: '/presets/styling/editorial.png',
    description: 'Effortless cool, movement-implied, slightly unposed. Gaze slightly off-lens. Brands like Zara, Mango, Reformation.',
    frontSnippet: 'Pronounced weight on right leg, left hip dropped, left foot angled outward with knee softly bent. Both arms hang naturally at the sides with a visible gap from the torso. Hands fully visible, fingers relaxed and natural. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCue: 'Same editorial energy, slightly off-axis posture.',
    frontSnippetMale: 'Pronounced weight on right leg, left hip dropped slightly. Both arms hang naturally at the sides with hands fully visible and relaxed. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCueMale: 'Same editorial energy, slightly off-axis posture.',
    threeQuarterSnippet: 'Diagonal shoulder line clearly established. Pronounced weight on right leg; left foot angled outward; left knee softly bent. Both arms hang naturally with a clear gap from the torso. Hands fully visible and relaxed, away from the waistband and garment. Head turned toward camera; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortlessly cool.',
    threeQuarterSnippetMale: 'Diagonal shoulder line clearly established. Pronounced weight on right leg; left foot angled outward; left knee softly bent. Both arms hang naturally with a clear gap from the torso. Hands fully visible and relaxed, away from the waistband and garment. Head turned toward camera; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortless cool.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Both arms relaxed slightly away from the body, hands visible and natural. Pronounced weight on right leg; left foot angled outward. Posture slightly off-axis; effortlessly cool editorial energy.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Both arms relaxed slightly away from the body, hands visible and natural. Pronounced weight on right leg. Posture slightly off-axis; effortless cool editorial energy.',
    backdropSnippet: 'Background: cool grey seamless studio sweep (#D8D8D8 at top fading to #E6E6E6 at bottom), very subtle top-to-bottom gradient — the ONLY direction that uses a gradient. Seamless grey sweep with no visible horizon line. Soft directional studio lighting with a slightly cooler tone.',
  },
  {
    id: 'premium',
    label: 'Premium Poise',
    imageUrl: '/presets/styling/premium.png',
    description: 'Elevated polish through warm off-white light, refined softness, and material richness. Brands like Sandro, Reiss, Ted Baker.',
    frontSnippet: 'Pose-safe premium direction: refined studio polish, visible relaxed hands, quiet neutral catalog stance, no crossed arms or pockets.',
    energyCue: 'Premium polish through warm light and material richness only; no added pose choreography.',
    frontSnippetMale: 'Pose-safe premium direction: refined studio polish, visible relaxed hands, quiet neutral catalog stance, no crossed arms or pockets.',
    energyCueMale: 'Premium polish through warm light and material richness only; no added pose choreography.',
    threeQuarterSnippet: 'Pose-safe premium direction: refined studio polish, visible hands, simple catalog stance, no crossed arms, pockets, or off-lens choreography.',
    threeQuarterSnippetMale: 'Pose-safe premium direction: refined studio polish, visible hands, simple catalog stance, no crossed arms, pockets, or off-lens choreography.',
    backSnippet: 'Pose-safe premium direction: refined rear view, visible hands when possible, warm off-white polish, no head-turn choreography.',
    backSnippetMale: 'Pose-safe premium direction: refined rear view, visible hands when possible, warm off-white polish, no head-turn choreography.',
    backdropSnippet: 'Background: warm off-white seamless studio sweep (#EDE8DF). Flat, even warm tone — no gradient, no vignette. Seamless warm sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Large diffused key light with a warm cast, refined material highlights, and quiet premium contrast.',
  },
  {
    id: 'street',
    label: 'Street Aesthetic',
    imageUrl: '/presets/styling/street.png',
    description: 'Understated urban retail feel through cool grey tone, contrast, and utilitarian styling. Brands like Urban Outfitters, Carhartt, Weekday.',
    frontSnippet: 'Pose-safe street direction: cool utilitarian retail polish, visible relaxed hands, neutral catalog stance, no slouching, pockets, or strong weight shift.',
    energyCue: 'Street feel through cool grey lighting and styling only; no slouching, pockets, or pose choreography.',
    frontSnippetMale: 'Pose-safe street direction: cool utilitarian retail polish, visible relaxed hands, neutral catalog stance, no slouching, pockets, or strong weight shift.',
    energyCueMale: 'Street feel through cool grey lighting and styling only; no slouching, pockets, or pose choreography.',
    threeQuarterSnippet: 'Pose-safe street direction: cool utilitarian polish, visible hands, simple catalog stance, no slouching, pockets, gaze choreography, or strong weight shift.',
    threeQuarterSnippetMale: 'Pose-safe street direction: cool utilitarian polish, visible hands, simple catalog stance, no slouching, pockets, gaze choreography, or strong weight shift.',
    backSnippet: 'Pose-safe street direction: cool clean rear view, visible hands when possible, no slouching or head-turn choreography.',
    backSnippetMale: 'Pose-safe street direction: cool clean rear view, visible hands when possible, no slouching or head-turn choreography.',
    backdropSnippet: 'Background: cool mid-grey seamless studio backdrop (#C8C8C8). Flat, even cool grey tone — no gradient, no vignette. Seamless grey sweep with no visible horizon line. Soft contact shadow under feet only. Slightly crisper directional light with a cool cast and understated urban retail contrast.',
  },
  {
    id: 'athletic',
    label: 'Athletic Performance',
    imageUrl: '/presets/styling/athletic.png',
    description: 'Fresh activewear catalog polish through bright light and crisp functional detail, without action poses. Brands like Lululemon, Gymshark, Alo Yoga.',
    frontSnippet: 'Pose-safe athletic direction: bright functional retail polish, visible relaxed hands, neutral catalog stance, no stride, flexing, forward lean, or performance action.',
    energyCue: 'Athletic feel through crisp light and functional styling only; no action posture or performance choreography.',
    frontSnippetMale: 'Pose-safe athletic direction: bright functional retail polish, visible relaxed hands, neutral catalog stance, no stride, flexing, forward lean, or performance action.',
    energyCueMale: 'Athletic feel through crisp light and functional styling only; no action posture or performance choreography.',
    threeQuarterSnippet: 'Pose-safe athletic direction: bright functional polish, visible hands, simple catalog stance, no stride, forward lean, core tension, or action posture.',
    threeQuarterSnippetMale: 'Pose-safe athletic direction: bright functional polish, visible hands, simple catalog stance, no stride, forward lean, core tension, or action posture.',
    backSnippet: 'Pose-safe athletic direction: bright clean rear view, visible hands when possible, no action posture or head-turn choreography.',
    backSnippetMale: 'Pose-safe athletic direction: bright clean rear view, visible hands when possible, no action posture or head-turn choreography.',
    backdropSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette. Seamless white sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Bright even studio lighting, crisp activewear detail, fresh clean highlights, and natural skin tone.',
  },
];

/**
 * Angle presets. First item is the default (Front).
 * Do not reorder without updating default resolution in App.
 */
export const ANGLE_PRESETS: AnglePreset[] = [
  {
    id: 'front',
    label: 'Front',
    imageUrl: '/presets/poses/front.png',
    promptSnippet: 'Front-facing, neutral expression, confident posture. Camera directly in front.',
  },
  {
    id: 'three-quarter',
    label: 'Three-quarter',
    imageUrl: '/presets/poses/three-quarter.png',
    promptSnippet: 'Three-quarter turn: body at approximately 45° to camera. Shoulders slightly turned, natural stance. Neutral expression.',
  },
  {
    id: 'back',
    label: 'Back',
    imageUrl: '/presets/poses/back.png',
    promptSnippet: 'Standing with back to camera. Weight slightly on right leg, left hip softly dropped, posture natural and upright. Arms hanging relaxed at sides, hands loose, small natural gap between arms and body — not pressed flat against sides. Shoulders level with a slight natural relaxation. Head rotated 45 degrees to the right, chin over right shoulder, right side of face clearly visible in profile. Left ear NOT visible. Full body from behind visible.',
  },
];
