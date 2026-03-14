import type { PdpStylePreset, AnglePreset, StylingDirectionPreset } from './types';

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
    imageUrl: '/presets/styling/minimal.png',
    description: 'The industry-standard PDP neutral. Contrapposto stance, still and composed. Works for any garment. Brands like COS, Uniqlo, Arket.',
    frontSnippet: 'Standing in a relaxed contrapposto stance, weight shifted onto the right leg with hip slightly raised on that side, left foot stepped forward and turned slightly outward, left knee softly bent. Right arm falls naturally at the side, hand relaxed at the hip. Left hand lightly rests at the waist. Shoulders level, chin slightly down, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCue: 'Same contrapposto stance, same composed neutral energy.',
    frontSnippetMale: 'Standing facing camera, weight slightly on one leg, arms relaxed at sides. Shoulders level, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCueMale: 'Same composed neutral energy, arms relaxed at sides.',
    backdropSnippet: 'Background: neutral light grey seamless studio sweep (#E0E0E0). Flat, even grey tone — no gradient, no vignette, no color shift. Seamless grey sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft, even studio lighting.',
  },
  {
    id: 'accessible',
    label: 'Accessible Warmth',
    imageUrl: '/presets/styling/accessible.png',
    description: 'Approachable, friendly, non-intimidating. Slight smile, natural weight shift. Brands like H&M, ASOS, Next.',
    frontSnippet: 'Standing in a relaxed contrapposto stance, weight shifted onto the right leg, left foot stepped forward, slight weight shift to one hip. Right arm at side, left hand lightly at hip. Direct gaze into camera, genuine soft smile with slightly parted lips, warm and approachable energy, natural and unpretentious.',
    energyCue: 'Same warm approachable energy, soft smile.',
    frontSnippetMale: 'Standing facing camera, weight slightly on one leg, arms relaxed at sides. Direct gaze into camera, genuine soft smile, warm and approachable energy, natural and unpretentious.',
    energyCueMale: 'Same warm approachable energy, soft smile.',
    backdropSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette, no grey tones. Seamless white sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft, warm studio lighting.',
  },
  {
    id: 'editorial',
    label: 'Editorial Cool',
    imageUrl: '/presets/styling/editorial.png',
    description: 'Effortless cool, movement-implied, slightly unposed. Gaze slightly off-lens. Brands like Zara, Mango, Reformation.',
    frontSnippet: 'Pronounced weight on right leg, left hip dropped, left foot angled outward with knee softly bent. Right hand loosely hooked at hip or tucked lightly at waistband. Left arm hanging fully relaxed at side, hand loose. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCue: 'Same editorial energy, slightly off-axis posture.',
    frontSnippetMale: 'Pronounced weight on right leg, left hip dropped slightly. Right hand deep in trouser pocket, thumb hooked at edge. Left arm hanging fully relaxed at side, hand loose. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCueMale: 'Same editorial energy, slightly off-axis posture.',
    backdropSnippet: 'Background: cool grey seamless studio sweep (#D8D8D8 at top fading to #E6E6E6 at bottom), very subtle top-to-bottom gradient — the ONLY direction that uses a gradient. Seamless grey sweep with no visible horizon line. Soft directional studio lighting with a slightly cooler tone.',
  },
  {
    id: 'premium',
    label: 'Premium Poise',
    imageUrl: '/presets/styling/premium.png',
    description: 'Quiet confidence, elevated bearing, nothing to prove. Neutral expression, gaze slightly off-lens. Brands like Sandro, Reiss, Ted Baker.',
    frontSnippet: 'Upright elongated stance with controlled contrapposto, one arm dropped at side with deliberately relaxed hand, fingers slightly extended and separated, gaze slightly off-lens to the left with composed bearing, neutral closed-mouth expression, premium fashion editorial energy, quiet confidence and stillness.',
    energyCue: 'Same premium poise, controlled stillness.',
    frontSnippetMale: 'Upright elongated stance, weight slightly on one leg, arms relaxed at sides. Gaze slightly off-lens with composed bearing, neutral closed-mouth expression, premium fashion editorial energy, quiet confidence and stillness.',
    energyCueMale: 'Same premium poise, controlled stillness.',
    backdropSnippet: 'Background: warm off-white seamless studio sweep (#EDE8DF). Flat, even warm tone — no gradient, no vignette. Seamless warm sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft diffused lighting with a warm cast.',
  },
  {
    id: 'street',
    label: 'Street Aesthetic',
    imageUrl: '/presets/styling/street.png',
    description: 'Loose, casual, self-expressive. Hands in pockets or at sides, relaxed asymmetric stance. Brands like Urban Outfitters, Carhartt, Weekday.',
    frontSnippet: 'Relaxed asymmetric stance, hands loosely in pockets with thumbs out or casually at sides, gaze directed slightly away from camera or a natural unstudied look into lens, natural unstudied expression — deadpan cool or natural, casual street energy, urban fashion editorial.',
    energyCue: 'Same street energy, casual unstudied posture.',
    backdropSnippet: 'Background: cool mid-grey seamless studio backdrop (#C8C8C8). Flat, even cool grey tone — no gradient, no vignette. Seamless grey sweep with no visible horizon line. Subtle directional lighting with a cool tone.',
  },
  {
    id: 'athletic',
    label: 'Athletic Performance',
    imageUrl: '/presets/styling/athletic.png',
    description: 'Strong, functional, embodied. Athletic ready position or dynamic stance. Brands like Lululemon, Gymshark, Alo Yoga.',
    frontSnippet: 'Athletic stance with feet hip-width apart, slight bend at knees, core engaged, arms in a dynamic stride or power position with one arm slightly forward, forward-focused determined gaze slightly upward, strong performance energy, activewear photography, determined neutral expression.',
    energyCue: 'Same athletic energy, strong engaged posture.',
    backdropSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette. Seamless white sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Bright, even studio lighting.',
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
    promptSnippet: 'Standing with back to camera. Head rotated 45 degrees to the right, chin over right shoulder, right side of face clearly visible in profile. Left ear NOT visible. Full body from behind visible. Same confident posture.',
  },
];
