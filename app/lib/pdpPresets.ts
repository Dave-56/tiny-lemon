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
 * Brand style presets. Evidence-based profiles from the Fashion PDP Visual Framework.
 * Each preset controls body language (stance, arms, expression, gaze) and backdrop per brand style.
 * First item (minimal) is the default — maps to the Universal PDP Neutral (contrapposto stance).
 * frontSnippet: injected into the front pose prompt (replaces the hardcoded pose line).
 * energyCue: short cue appended to 3/4 and back turns — kept terse so multi-turn chat context isn't confused.
 *
 * Expression is baked into each profile per framework research:
 * slight smile for accessible/mid-market (+18% CTR, +21% sales), neutral for premium/luxury.
 */
export const BRAND_STYLE_PRESETS: BrandStylePreset[] = [
  {
    id: 'minimal',
    label: 'Minimal Clarity',
    imageUrl: '/presets/styling/minimal.png',
    description: 'The industry-standard PDP neutral. Contrapposto stance, still and composed. Works for any garment. Brands like COS, Uniqlo, Arket.',
    frontSnippet: 'Weight fully on right leg, left hip dropped, left foot stepped forward and turned slightly outward, left knee softly bent. Right arm falls naturally at side, hand relaxed. Left hand rests lightly at waist. Shoulders level, chin slightly down, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCue: 'Same weight on right leg, left hip dropped, still and composed neutral energy.',
    frontSnippetMale: 'Weight slightly on right leg, left foot stepped forward. Arms relaxed at sides, hands loose. Shoulders level, direct gaze into camera, neutral closed-mouth expression, still and composed.',
    energyCueMale: 'Same weight slightly on right leg, composed neutral energy, arms relaxed at sides.',
    threeQuarterSnippet: 'Weight on right leg, left foot stepped slightly forward and turned slightly outward, left knee softly bent. Right arm relaxed at side, hand loose; left hand rests lightly at waist. Shoulders level, chin slightly down. Head turned toward camera; direct gaze into lens, neck relaxed. Neutral closed-mouth expression; still and composed.',
    threeQuarterSnippetMale: 'Weight slightly on right leg, left foot stepped slightly forward, knees soft. Arms relaxed at sides, hands loose and natural. Shoulders level, chin slightly down. Head turned toward camera; direct gaze into lens, neck relaxed. Neutral closed-mouth expression; composed and still.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms relaxed at sides, hands loose, small natural gap between arms and body. Weight on right leg, left hip softly dropped. Posture natural and upright; still and composed.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms relaxed at sides, hands loose. Weight slightly on right leg. Posture natural and upright; composed and still.',
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
    threeQuarterSnippet: 'Weight on right leg, left foot stepped forward, left knee softly bent, hips naturally shifted. Right arm relaxed at side; left hand loosely at hip, fingers open. Shoulders relaxed, chest open. Head turned toward camera; direct gaze into lens with a genuine soft smile; warm and approachable.',
    threeQuarterSnippetMale: 'Weight slightly on right leg, left foot stepped forward, knees soft. Right arm relaxed at side; left hand loosely at hip. Shoulders relaxed. Head turned toward camera; direct gaze into lens with a genuine soft smile; approachable and friendly.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible with a soft smile. Arms relaxed at sides; right hand loose, left hand lightly at hip. Weight on right leg, natural hip shift. Warm, approachable energy.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible with a soft smile. Arms relaxed at sides, hands loose. Weight slightly on right leg. Warm, approachable energy.',
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
    threeQuarterSnippet: 'Diagonal shoulder line clearly established. Pronounced weight on right leg; left foot angled outward; left knee softly bent. Both arms hanging at sides: right arm loose, right hand resting against outer right thigh; left arm hanging fully relaxed, hand loose. Head turned toward camera; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortlessly cool.',
    threeQuarterSnippetMale: 'Diagonal shoulder line clearly established. Pronounced weight on right leg; left foot angled outward; left knee softly bent. Both arms hanging at sides: right arm loose, right hand against outer right thigh; left arm hanging fully relaxed, hand loose. Head turned toward camera; gaze directed 15–20° to the left of camera; chin level or slightly elevated. Neutral-to-serious expression; effortless cool.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Both arms hanging relaxed at sides, hands loose. Pronounced weight on right leg; left foot angled outward. Posture slightly off-axis; effortlessly cool editorial energy.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Both arms hanging at sides, hands loose. Pronounced weight on right leg. Posture slightly off-axis; effortless cool editorial energy.',
    backdropSnippet: 'Background: cool grey seamless studio sweep (#D8D8D8 at top fading to #E6E6E6 at bottom), very subtle top-to-bottom gradient — the ONLY direction that uses a gradient. Seamless grey sweep with no visible horizon line. Soft directional studio lighting with a slightly cooler tone.',
  },
  {
    id: 'premium',
    label: 'Premium Poise',
    imageUrl: '/presets/styling/premium.png',
    description: 'Quiet confidence, elevated bearing, nothing to prove. Neutral expression, gaze slightly off-lens. Brands like Sandro, Reiss, Ted Baker.',
    frontSnippet: 'Upright elongated stance, weight on right leg, left foot slightly forward. Right arm dropped fully at side, hand deliberately relaxed, fingers slightly extended and separated. Left hand loosely at hip. Gaze 10–15 degrees to the left of lens, chin level, composed bearing. Neutral closed-mouth expression, quiet confidence and stillness. Premium fashion editorial energy.',
    energyCue: 'Same premium poise, controlled stillness.',
    frontSnippetMale: 'Upright elongated stance, weight on right leg. Arms crossed loosely at chest — right arm over left, hands relaxed not gripping. Gaze 10–15 degrees to the left of lens, chin level or slightly elevated. Neutral closed-mouth expression, quiet confidence — reads as confident, not defensive.',
    energyCueMale: 'Same upright stance, arms loosely crossed, gaze 10–15 degrees left of lens.',
    threeQuarterSnippet: 'Diagonal shoulder line clearly established. Upright, elongated stance; weight on right leg; left foot slightly forward; knees softly straight. Both arms dropped at sides: right arm hanging straight, fingers deliberately extended and separated; left arm hanging straight, hand relaxed. Visible natural gap between each arm and the body. Shoulders level, chin level. Head turned toward camera; gaze 12–18° to the left of lens; neutral closed-mouth expression; quiet confidence and stillness.',
    threeQuarterSnippetMale: 'Diagonal shoulder line clearly established. Upright, elongated stance; weight on right leg; feet comfortably set; knees soft. Both arms hanging straight at sides — uncrossed, hands not in pockets. Visible natural gap between each arm and the body. Shoulders level, chin level or slightly elevated. Head turned toward camera; gaze 12–18° to the left of lens; neutral closed-mouth expression; poised and assured.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms dropped at sides, fingers deliberately relaxed and slightly separated. Visible gap between arms and body. Upright elongated stance; weight on right leg. Quiet confidence and stillness.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms hanging straight at sides, hands relaxed. Visible gap between arms and body. Upright elongated stance; weight on right leg. Poised and assured.',
    backdropSnippet: 'Background: warm off-white seamless studio sweep (#EDE8DF). Flat, even warm tone — no gradient, no vignette. Seamless warm sweep floor and wall with no visible horizon line. Soft contact shadow under feet only. Soft diffused lighting with a warm cast.',
  },
  {
    id: 'street',
    label: 'Street Aesthetic',
    imageUrl: '/presets/styling/street.png',
    description: 'Loose, casual, self-expressive. Hands in pockets or at sides, relaxed asymmetric stance. Brands like Urban Outfitters, Carhartt, Weekday.',
    frontSnippet: 'Relaxed asymmetric stance, strong weight shift to right hip. Right hand lightly at outer thigh, thumb slightly hooked. Left arm relaxed at side, elbow slightly bent. Shoulders slightly dropped, posture unstudied and loose. Gaze directed 20–25 degrees to the left of camera, chin level, deadpan cool expression — not smiling, not serious, just present. Urban fashion editorial energy.',
    energyCue: 'Same street energy, casual unstudied posture.',
    frontSnippetMale: 'Relaxed asymmetric stance, strong weight shift to right hip. Both hands deep in trouser pockets, thumbs hooked at edge. Shoulders slightly dropped. Gaze 20–25 degrees to the left of camera, chin level, deadpan cool — not smiling, not serious, just present.',
    energyCueMale: 'Same strong weight shift to right hip, both hands deep in pockets, gaze 20–25 degrees left.',
    threeQuarterSnippet: 'Relaxed asymmetric stance, strong weight shift to right hip; left foot stepped forward; knees easy. Shoulders slightly dropped; posture unstudied and loose. Right hand lightly at outer thigh, thumb slightly hooked; left arm relaxed at side, elbow softly bent. Head turned toward camera; gaze directed 20–25° to the left of camera; chin level. Deadpan cool — not smiling, not serious, just present.',
    threeQuarterSnippetMale: 'Strong weight shift to right hip; left foot stepped forward; knees easy. Shoulders slightly dropped. Both hands deep in trouser pockets, thumbs hooked at edge. Head turned toward camera; gaze directed 20–25° to the left of camera; chin level. Deadpan cool — not smiling, not serious, just present.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Right hand lightly at outer thigh; left arm relaxed at side. Strong weight shift to right hip. Shoulders slightly dropped; loose, unstudied posture. Deadpan cool energy.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Both hands loosely at sides or in back pockets. Strong weight shift to right hip. Shoulders slightly dropped. Deadpan cool energy.',
    backdropSnippet: 'Background: cool mid-grey seamless studio backdrop (#C8C8C8). Flat, even cool grey tone — no gradient, no vignette. Seamless grey sweep with no visible horizon line. Subtle directional lighting with a cool tone.',
  },
  {
    id: 'athletic',
    label: 'Athletic Performance',
    imageUrl: '/presets/styling/athletic.png',
    description: 'Strong, functional, embodied. Athletic ready position or dynamic stance. Brands like Lululemon, Gymshark, Alo Yoga.',
    frontSnippet: 'Athletic stance, feet hip-width apart, slight bend at knees, weight evenly distributed, core visibly engaged. Right arm slightly forward in a natural stride position, left arm back. Forward-focused gaze slightly upward, chin up, determined neutral expression. Strong performance energy, activewear photography.',
    energyCue: 'Same athletic energy, strong engaged posture.',
    frontSnippetMale: 'Athletic stance, feet hip-width apart, slight bend at knees, weight evenly distributed, core visibly engaged. Right arm slightly forward in a natural stride position, left arm back. Forward-focused gaze slightly upward, chin up, determined neutral expression. Strong performance energy, activewear photography.',
    energyCueMale: 'Same athletic energy, strong engaged posture.',
    threeQuarterSnippet: 'Feet hip-width, slight bend at knees, weight evenly distributed with a subtle forward lean; core visibly engaged. Left arm slightly forward as if mid-stride; right arm slightly back; hands relaxed. Shoulders steady, chin up. Head turned toward camera; forward-focused gaze slightly above horizon; determined neutral expression.',
    threeQuarterSnippetMale: 'Feet hip-width, slight bend at knees, even weight with a small forward lean; core engaged. Left arm slightly forward in a natural stride position; right arm slightly back; hands relaxed. Shoulders steady, chin up. Head turned toward camera; forward-focused gaze slightly above horizon; determined neutral expression.',
    backSnippet: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms relaxed at sides with subtle athletic tension; hands loose. Feet hip-width, even weight distribution. Upright athletic posture; strong, engaged energy.',
    backSnippetMale: 'Head turned 45° to the right, chin over right shoulder, right side of face visible in profile. Arms relaxed at sides with subtle athletic tension; hands loose. Feet hip-width, even weight distribution. Upright athletic posture; strong, engaged energy.',
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
