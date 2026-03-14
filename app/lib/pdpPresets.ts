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
    frontSnippet: 'Weight fully on right leg, left hip dropped, left foot stepped forward and turned slightly outward, left knee softly bent. Right arm falls naturally at side, hand relaxed. Left hand rests lightly at waist. Shoulders level, chin slightly down, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCue: 'Same weight on right leg, left hip dropped, still and composed neutral energy.',
    frontSnippetMale: 'Weight slightly on right leg, left foot stepped forward. Arms relaxed at sides, hands loose. Shoulders level, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCueMale: 'Same weight slightly on right leg, composed neutral energy, arms relaxed at sides.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Weight fully on the right leg; left foot stepped slightly forward and turned slightly outward; left knee softly bent. Right arm falls naturally at side, hand relaxed; left hand rests lightly at waist. Shoulders level; chin slightly down. Face turned back toward lens; direct gaze into camera (or within 0–5° of lens), neck relaxed, no strain. Neutral closed-mouth expression; still and composed.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Weight slightly on the right leg; left foot stepped slightly forward; knees soft but straight. Arms relaxed at sides, hands loose and natural. Shoulders level; chin slightly down. Face turned back toward lens; direct gaze into camera (or within 0–5° of lens), neck relaxed, no strain. Neutral closed-mouth expression; composed and still.',
    backdropSnippet: 'Background: neutral light grey seamless studio sweep (#E0E0E0). Flat, even grey tone — no gradient, no vignette, no color shift. Seamless grey sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft, even studio lighting.',
  },
  {
    id: 'accessible',
    label: 'Accessible Warmth',
    imageUrl: '/presets/styling/accessible.png',
    description: 'Approachable, friendly, non-intimidating. Slight smile, natural weight shift. Brands like H&M, ASOS, Next.',
    frontSnippet: 'Weight on right leg, left foot stepped forward, left knee softly bent, hip naturally shifted. Right arm relaxed at side. Left hand loosely at hip, fingers open. Direct gaze into camera, genuine soft smile with slightly parted lips, warm and approachable, natural and unpretentious.',
    energyCue: 'Same weight on right leg, left hand open at hip, warm soft smile.',
    frontSnippetMale: 'Weight slightly on right leg, left foot stepped forward. Right arm relaxed at side, left hand loosely at hip. Direct gaze into camera, genuine soft smile, warm and approachable energy.',
    energyCueMale: 'Same weight on right leg, left hand at hip, warm soft smile.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Weight on the right leg; left foot stepped forward; left knee softly bent; hips naturally shifted. Right arm relaxed at side; left hand loosely at hip, fingers open. Shoulders relaxed, chest open. Direct gaze into camera with a genuine soft smile; warm and approachable.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Weight slightly on the right leg; left foot stepped forward; knees soft. Right arm relaxed at side; left hand loosely at hip. Shoulders relaxed. Direct gaze into camera with a genuine soft smile; approachable and friendly.',
    backdropSnippet: 'Background: pure white seamless studio backdrop (#FFFFFF). Completely flat white — no gradient, no vignette, no grey tones. Seamless white sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft, warm studio lighting.',
  },
  {
    id: 'editorial',
    label: 'Editorial Cool',
    imageUrl: '/presets/styling/editorial.png',
    description: 'Effortless cool, movement-implied, slightly unposed. Gaze slightly off-lens. Brands like Zara, Mango, Reformation.',
    frontSnippet: 'Pronounced weight on right leg, left hip dropped, left foot angled outward with knee softly bent. Right hand resting lightly at outer thigh, fingers softly curled inward. Left arm hanging fully relaxed at side, hand loose. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCue: 'Same editorial energy, slightly off-axis posture.',
    frontSnippetMale: 'Pronounced weight on right leg, left hip dropped slightly. Right hand deep in trouser pocket, thumb hooked at edge. Left arm hanging fully relaxed at side, hand loose. Torso rotated slightly away from camera. Face turned back toward lens, gaze directed 15–20 degrees to the left of camera, chin level or slightly elevated, not looking directly at lens. Neutral-to-serious expression, effortlessly cool.',
    energyCueMale: 'Same editorial energy, slightly off-axis posture.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Pronounced weight on the right leg; left foot angled outward; left knee softly bent. Torso rotated slightly away from camera. Right hand resting lightly at outer thigh, fingers softly curled inward; left arm hanging fully relaxed at side, hand loose. Face turned back toward lens; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortlessly cool.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Pronounced weight on the right leg; left foot angled outward; left knee softly bent. Torso rotated slightly away from camera. Right hand deep in trouser pocket, thumb hooked at edge; left arm hanging relaxed at side, hand loose. Face turned back toward lens; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortlessly cool.',
    backdropSnippet: 'Background: cool grey seamless studio sweep (#D8D8D8 at top fading to #E6E6E6 at bottom), very subtle top-to-bottom gradient — the ONLY direction that uses a gradient. Seamless grey sweep with no visible horizon line. Soft directional studio lighting with a slightly cooler tone.',
  },
  {
    id: 'premium',
    label: 'Premium Poise',
    imageUrl: '/presets/styling/premium.png',
    description: 'Quiet confidence, elevated bearing, nothing to prove. Neutral expression, gaze slightly off-lens. Brands like Sandro, Reiss, Ted Baker.',
    frontSnippet: 'Upright elongated stance, weight on right leg, left foot slightly forward. Right arm dropped fully at side, hand deliberately relaxed, fingers slightly extended and separated. Left hand loosely at hip. Gaze 10–15 degrees to the left of lens, chin level, composed bearing. Neutral closed-mouth expression, quiet confidence and stillness.',
    energyCue: 'Same upright stance, gaze 10–15 degrees left of lens, composed stillness.',
    frontSnippetMale: 'Upright elongated stance, weight on right leg. Arms crossed loosely at chest — right arm over left, hands relaxed not gripping. Gaze 10–15 degrees to the left of lens, chin level or slightly elevated. Neutral closed-mouth expression, quiet confidence — reads as confident, not defensive.',
    energyCueMale: 'Same upright stance, arms loosely crossed, gaze 10–15 degrees left of lens.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Upright, elongated stance; weight on the right leg; left foot slightly forward; knees softly straight. Right arm dropped fully at side, fingers deliberately relaxed; left hand loosely at hip. Shoulders level; chin level. Gaze 10–15° to the left of lens; neutral closed-mouth expression; quiet confidence and stillness.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Upright, elongated stance; weight on the right leg; feet comfortably set; knees soft. Arms crossed loosely at chest (right forearm over left), hands relaxed — not gripping. Shoulders level; chin level or slightly elevated. Gaze 10–15° to the left of lens; neutral closed-mouth expression; poised and assured.',
    backdropSnippet: 'Background: warm off-white seamless studio sweep (#EDE8DF). Flat, even warm tone — no gradient, no vignette. Seamless warm sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft diffused lighting with a warm cast.',
  },
  {
    id: 'street',
    label: 'Street Aesthetic',
    imageUrl: '/presets/styling/street.png',
    description: 'Loose, casual, self-expressive. Hands in pockets or at sides, relaxed asymmetric stance. Brands like Urban Outfitters, Carhartt, Weekday.',
    frontSnippet: 'Relaxed asymmetric stance, strong weight shift to right hip. Right hand lightly at outer thigh, thumb slightly hooked. Left arm relaxed at side, elbow slightly bent. Shoulders slightly dropped, posture unstudied and loose. Gaze directed 20–25 degrees to the left of camera, chin level, deadpan cool expression — not smiling, not serious, just present.',
    energyCue: 'Same strong weight shift to right hip, both hands in pockets, gaze 20–25 degrees left.',
    frontSnippetMale: 'Relaxed asymmetric stance, strong weight shift to right hip. Both hands deep in trouser pockets, thumbs hooked at edge. Shoulders slightly dropped. Gaze 20–25 degrees to the left of camera, chin level, deadpan cool — not smiling, not serious, just present.',
    energyCueMale: 'Same strong weight shift to right hip, both hands deep in pockets, gaze 20–25 degrees left.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Relaxed asymmetric stance, strong weight shift to the right hip; left foot stepped forward; knees easy. Shoulders slightly dropped; posture unstudied and loose. Right hand lightly at outer thigh, thumb slightly hooked; left arm relaxed at side, elbow softly bent. Gaze directed 20–25° to the left of camera; chin level. Deadpan cool — not smiling, not serious, just present.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Strong weight shift to the right hip; left foot stepped forward; knees easy. Shoulders slightly dropped. Both hands deep in trouser pockets, thumbs hooked at edge. Gaze directed 20–25° to the left of camera; chin level. Deadpan cool — not smiling, not serious, just present.',
    backdropSnippet: 'Background: cool mid-grey seamless studio backdrop (#C8C8C8). Flat, even cool grey tone — no gradient, no vignette. Seamless grey sweep with no visible horizon line. Subtle directional lighting with a cool tone.',
  },
  {
    id: 'athletic',
    label: 'Athletic Performance',
    imageUrl: '/presets/styling/athletic.png',
    description: 'Strong, functional, embodied. Athletic ready position or dynamic stance. Brands like Lululemon, Gymshark, Alo Yoga.',
    frontSnippet: 'Athletic stance, feet hip-width apart, slight bend at knees, weight evenly distributed, core visibly engaged. Right arm slightly forward in a natural stride position, left arm back. Forward-focused gaze slightly upward, chin up, determined neutral expression.',
    energyCue: 'Same athletic stance, feet hip-width, core engaged, forward-focused gaze.',
    frontSnippetMale: 'Athletic stance, feet hip-width apart, slight bend at knees, weight evenly distributed, core visibly engaged. Right arm slightly forward in a natural stride position, left arm back. Forward-focused gaze slightly upward, chin up, determined neutral expression.',
    energyCueMale: 'Same athletic stance, feet hip-width, core engaged, forward-focused gaze.',
    threeQuarterSnippet: 'Body at 45°, left shoulder closer to lens. Feet hip-width, slight bend at knees, weight evenly distributed with a subtle forward lean; core engaged. Left arm slightly forward as if mid-stride; right arm slightly back; hands relaxed. Shoulders square to the body angle; chin up. Forward-focused gaze slightly above horizon; determined neutral expression.',
    threeQuarterSnippetMale: 'Body at 45°, left shoulder closer to lens. Feet hip-width, slight bend at knees, even weight with a small forward lean; core engaged. Left arm slightly forward in a natural stride position; right arm slightly back; hands relaxed. Shoulders steady; chin up. Forward-focused gaze slightly above horizon; determined neutral expression.',
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
    promptSnippet: 'Standing with back to camera. Weight slightly on right leg, left hip softly dropped, posture natural and upright. Arms hanging relaxed at sides, hands loose, small natural gap between arms and body — not pressed flat against sides. Shoulders level with a slight natural relaxation. Head rotated 45 degrees to the right, chin over right shoulder, right side of face clearly visible in profile. Left ear NOT visible. Full body from behind visible.',
  },
];
