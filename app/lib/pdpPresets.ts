import type { PdpStylePreset, AnglePreset, StylingDirectionPreset } from './types';

/**
 * PDP style presets. First item is the default (White Studio).
 * Do not reorder without updating default resolution in App.
 */
export const PDP_STYLE_PRESETS: PdpStylePreset[] = [
  {
    id: 'white-studio',
    label: 'White / clean studio',
    description: 'Pure or near-white background, soft even light. Classic product look, works for most retailers (e.g. ASOS, Zara). Very safe and versatile.',
    promptSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette, no grey tones, no color shift anywhere in the frame. The floor is the same seamless white sweep as the wall with no visible horizon line or studio edges. Very soft contact shadow directly under the feet only. Soft, even studio lighting with no harsh shadows on the garment or body.',
  },
  {
    id: 'grey-studio',
    label: 'Grey / neutral studio',
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
 * Styling direction presets. Evidence-based profiles from the Fashion PDP Visual Framework.
 * First item (minimal) is the default — maps to the Universal PDP Neutral (contrapposto stance).
 * frontSnippet: injected into the front pose prompt (replaces the hardcoded pose line).
 * energyCue: short cue appended to 3/4 and back turns — kept terse so multi-turn chat context isn't confused.
 *
 * Expression is baked into each profile per framework research:
 * slight smile for accessible/mid-market (+18% CTR, +21% sales), neutral for premium/luxury.
 */
export const STYLING_DIRECTION_PRESETS: StylingDirectionPreset[] = [
  {
    id: 'minimal',
    label: 'Minimal Clarity',
    description: 'The industry-standard PDP neutral. Contrapposto stance, still and composed. Works for any garment. Brands like COS, Uniqlo, Arket.',
    frontSnippet: 'Standing in a relaxed contrapposto stance, weight shifted onto the right leg with hip slightly raised on that side, left foot stepped forward and turned slightly outward, left knee softly bent. Right arm falls naturally at the side, hand relaxed at the hip. Left hand lightly rests at the waist. Shoulders level, chin slightly down, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCue: 'Same contrapposto stance, same composed neutral energy.',
  },
  {
    id: 'accessible',
    label: 'Accessible Warmth',
    description: 'Approachable, friendly, non-intimidating. Slight smile, natural weight shift. Brands like H&M, ASOS, Next.',
    frontSnippet: 'Standing in a relaxed contrapposto stance, weight shifted onto the right leg, left foot stepped forward, slight weight shift to one hip. Right arm at side, left hand lightly at hip. Direct gaze into camera, genuine soft smile with slightly parted lips, warm and approachable energy, natural and unpretentious.',
    energyCue: 'Same warm approachable energy, soft smile.',
  },
  {
    id: 'editorial',
    label: 'Editorial Cool',
    description: 'Effortless cool, movement-implied, slightly unposed. Gaze slightly off-lens. Brands like Zara, Mango, Reformation.',
    frontSnippet: 'Slightly asymmetric stance with pronounced hip shift, torso angled 15 degrees away from camera, face turning back toward lens, one hand loosely adjusting the neckline or at the waist, gaze 5 degrees off-lens to the left, editorial fashion energy, effortlessly cool and slightly unposed, neutral-to-serious expression.',
    energyCue: 'Same editorial energy, slightly off-axis posture.',
  },
  {
    id: 'premium',
    label: 'Premium Poise',
    description: 'Quiet confidence, elevated bearing, nothing to prove. Neutral expression, gaze slightly off-lens. Brands like Sandro, Reiss, Ted Baker.',
    frontSnippet: 'Upright elongated stance with controlled contrapposto, one arm dropped at side with deliberately relaxed hand, fingers slightly extended and separated, gaze slightly off-lens to the left with composed bearing, neutral closed-mouth expression, premium fashion editorial energy, quiet confidence and stillness.',
    energyCue: 'Same premium poise, controlled stillness.',
  },
  {
    id: 'street',
    label: 'Street Energy',
    description: 'Loose, casual, self-expressive. Hands in pockets or at sides, relaxed asymmetric stance. Brands like Urban Outfitters, Carhartt, Weekday.',
    frontSnippet: 'Relaxed asymmetric stance, hands loosely in pockets with thumbs out or casually at sides, gaze directed slightly away from camera or a natural unstudied look into lens, natural unstudied expression — deadpan cool or natural, casual street energy, urban fashion editorial.',
    energyCue: 'Same street energy, casual unstudied posture.',
  },
  {
    id: 'athletic',
    label: 'Athletic Performance',
    description: 'Strong, functional, embodied. Athletic ready position or dynamic stance. Brands like Lululemon, Gymshark, Alo Yoga.',
    frontSnippet: 'Athletic stance with feet hip-width apart, slight bend at knees, core engaged, arms in a dynamic stride or power position with one arm slightly forward, forward-focused determined gaze slightly upward, strong performance energy, activewear photography, determined neutral expression.',
    energyCue: 'Same athletic energy, strong engaged posture.',
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
    promptSnippet: 'Front-facing, neutral expression, confident posture. Camera directly in front.',
  },
  {
    id: 'three-quarter',
    label: 'Three-quarter',
    promptSnippet: 'Three-quarter turn: body at approximately 45° to camera. Shoulders slightly turned, natural stance. Neutral expression.',
  },
  {
    id: 'back',
    label: 'Back',
    promptSnippet: 'Standing with back to camera. Head rotated 45 degrees to the right, chin over right shoulder, right side of face clearly visible in profile. Left ear NOT visible. Full body from behind visible. Same confident posture.',
  },
];
