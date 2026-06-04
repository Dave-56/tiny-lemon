import { describe, expect, it } from 'vitest';

import { buildPromptFromSpec } from './garmentFidelityPrompt';
import type { GarmentSpec } from './garmentSpec';
import { BRAND_STYLE_PRESETS, PDP_STYLE_PRESETS } from './pdpPresets';

const spec: GarmentSpec = {
  garment_type: 'blazer',
  hem_length: 'hip',
  sleeve_length: 'long',
  fit: 'fitted',
  silhouette: 'straight',
  primary_colors: ['black'],
  has_logo_or_text: false,
  notable_details: 'single-breasted with flap pockets',
};

const backdropSnippet = PDP_STYLE_PRESETS[0]!.promptSnippet;

function getBrandStyle(id: string) {
  const preset = BRAND_STYLE_PRESETS.find((entry) => entry.id === id);
  if (!preset) {
    throw new Error(`Missing brand preset: ${id}`);
  }
  return preset;
}

describe('buildPromptFromSpec hand-safety prompts', () => {
  it('adds the shared hand-safety block to the default front pose', () => {
    const prompt = buildPromptFromSpec(spec, 'front', backdropSnippet);

    expect(prompt).toContain('Hand safety (critical):');
    expect(prompt).toContain('Keep hands fully visible and clearly shaped.');
    expect(prompt).toContain('Keep hands away from the torso, waistband, pockets, and hem.');
    expect(prompt).toContain('No distorted fingers, fused hands, or hidden hands unless intentionally requested.');
    expect(prompt).toContain('Both arms rest naturally at the sides with a small visible gap from the torso.');
  });

  it('uses the safer default three-quarter copy when no brand style override is present', () => {
    const prompt = buildPromptFromSpec(spec, 'three-quarter', backdropSnippet);

    expect(prompt).toContain('Simple natural catalog stance.');
    expect(prompt).toContain('no exaggerated hip drop or crossed legs');
    expect(prompt).toContain('Hands stay fully visible and away from the waistband and garment.');
    expect(prompt).not.toContain('left hand rests lightly at waist');
    expect(prompt).not.toContain('deep in trouser pocket');
  });

  it('uses the safer default back copy when no brand style override is present', () => {
    const prompt = buildPromptFromSpec(spec, 'back', backdropSnippet);

    expect(prompt).toContain('Standing naturally from the rear angle with feet placed comfortably and realistically.');
    expect(prompt).toContain('Arms relaxed slightly away from the body.');
    expect(prompt).toContain('Hands remain visible from the rear angle when possible');
    expect(prompt).toContain('No distorted fingers, fused hands, or hidden hands unless intentionally requested.');
  });

  it('adds a protected graphic/text fidelity instruction when the garment has printed content', () => {
    const prompt = buildPromptFromSpec(
      {
        ...spec,
        has_logo_or_text: true,
        notable_details: 'large white "PARIS 88" chest graphic',
      },
      'front',
      backdropSnippet,
    );

    expect(prompt).toContain('Graphic/text fidelity is critical.');
    expect(prompt).toContain('large white "PARIS 88" chest graphic');
    expect(prompt).toContain('Do not redraw, paraphrase, mirror, scramble, stylize, replace, or invent any graphics or text.');
  });

  it('does not let the minimal preset override the relaxed catalog stance', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'three-quarter',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('minimal'),
      'Female',
    );

    expect(prompt).toContain('Simple natural catalog stance.');
    expect(prompt).toContain('no exaggerated hip drop or crossed legs');
    expect(prompt).not.toContain('Weight on right leg, left foot stepped slightly forward');
    expect(prompt).not.toContain('left hand rests lightly at waist');
  });

  it('does not let the accessible preset add expression or hip choreography', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'front',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('accessible'),
      'Female',
    );

    expect(prompt).toContain('Standing naturally with weight balanced and posture relaxed.');
    expect(prompt).not.toContain('genuine soft smile');
    expect(prompt).not.toContain('left foot stepped forward, left knee softly bent');
    expect(prompt).not.toContain('Left hand loosely at hip');
    expect(prompt).not.toContain('left hand lightly at hip');
  });

  it('does not let the premium male preset override the relaxed stance', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'front',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('premium'),
      'Male',
    );

    expect(prompt).toContain('Standing naturally with weight balanced and posture relaxed.');
    expect(prompt).not.toContain('Both arms dropped naturally at the sides');
    expect(prompt).not.toContain('Arms crossed loosely at chest');
    expect(prompt).not.toContain('hands not in pockets');
  });

  it('does not let the editorial male preset add off-axis posture', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'front',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('editorial'),
      'Male',
    );

    expect(prompt).toContain('Standing naturally with weight balanced and posture relaxed.');
    expect(prompt).not.toContain('Torso rotated slightly away from camera');
    expect(prompt).not.toContain('gaze directed 15–20 degrees');
    expect(prompt).not.toContain('deep in trouser pocket');
    expect(prompt).not.toContain('thumb hooked at edge');
  });

  it('does not let the street preset add strong weight shift', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'three-quarter',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('street'),
      'Male',
    );

    expect(prompt).toContain('Simple natural catalog stance.');
    expect(prompt).not.toContain('Strong weight shift to right hip');
    expect(prompt).not.toContain('Both hands deep in trouser pockets');
    expect(prompt).not.toContain('thumbs hooked at edge');
  });

  it('does not let the athletic preset add performance posture', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'three-quarter',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('athletic'),
      'Female',
    );

    expect(prompt).toContain('Simple natural catalog stance.');
    expect(prompt).not.toContain('core visibly engaged');
    expect(prompt).not.toContain('mid-stride');
    expect(prompt).not.toContain('Right arm slightly forward');
    expect(prompt).not.toContain('Left arm slightly forward');
  });

  it.each([
    ['minimal', 'Minimal Clarity', 'matte grey balance'],
    ['accessible', 'Accessible Warmth', 'soft warm light'],
    ['premium', 'Premium Poise', 'refined diffused lighting'],
    ['street', 'Street Aesthetic', 'Cool grey studio image'],
    ['athletic', 'Athletic Performance', 'clean functional activewear polish'],
  ])('adds %s as a visual-only style direction', (id, label, cue) => {
    const prompt = buildPromptFromSpec(
      spec,
      'three-quarter',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle(id),
      'Female',
    );

    expect(prompt).toContain(`STYLE DIRECTION (visual only): ${label}.`);
    expect(prompt).toContain(cue);
    expect(prompt).toContain('Simple natural catalog stance.');
    expect(prompt).toContain('Keep hands fully visible and clearly shaped.');
  });

  it('keeps non-editorial legacy preset snippets inside the safe pose envelope', () => {
    const unsafeFragments = [
      'Weight on right leg',
      'Weight fully on right leg',
      'Weight slightly on right leg',
      'left hip softly dropped',
      'hip naturally shifted',
      'Head turned 45°',
      'genuine soft smile',
      'Gaze 10–15',
      'gaze 20–25',
      'Strong weight shift to right hip',
      'core visibly engaged',
      'small forward lean',
      'hands not in pockets',
    ];
    const nonEditorial = BRAND_STYLE_PRESETS.filter(
      (preset) => preset.id !== 'editorial',
    );

    for (const preset of nonEditorial) {
      const searchable = [
        preset.frontSnippet,
        preset.energyCue,
        preset.frontSnippetMale,
        preset.energyCueMale,
        preset.threeQuarterSnippet,
        preset.threeQuarterSnippetMale,
        preset.backSnippet,
        preset.backSnippetMale,
      ].join('\n');

      for (const fragment of unsafeFragments) {
        expect(searchable).not.toContain(fragment);
      }
    }
  });

  it('does not describe a generated front image when no visual anchor is provided', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'three-quarter',
      backdropSnippet,
      false,
      false,
      undefined,
      getBrandStyle('editorial'),
      'Female',
    );

    expect(prompt).toContain('You are given 2 images:');
    expect(prompt).not.toContain('front-view result of this model already wearing this garment');
    expect(prompt).not.toContain('Match these exactly from the front result');
  });

  it('uses a generated front image as a background and lighting anchor when provided', () => {
    const prompt = buildPromptFromSpec(
      spec,
      'back',
      backdropSnippet,
      false,
      true,
      undefined,
      getBrandStyle('editorial'),
      'Female',
    );

    expect(prompt).toContain('You are given 3 images:');
    expect(prompt).toContain('BACKGROUND, LIGHTING, and OUTFIT CONSISTENCY anchor');
    expect(prompt).toContain('Match the exact same backdrop color/gradient');
    expect(prompt).toContain('floor tone, contact shadow softness, lighting direction');
    expect(prompt).toContain('Do NOT copy the pose, body angle, arm positions, or camera angle');
    expect(prompt).toContain('Standing naturally from the rear angle with feet placed comfortably and realistically.');
    expect(prompt).not.toContain('Head turned 45° to the right');
  });

  it('uses merchant front details when the uploaded reference is the back', () => {
    const prompt = buildPromptFromSpec(
      {
        ...spec,
        garment_type: 't-shirt',
        notable_details: 'plain back with ribbed collar',
      },
      'front',
      backdropSnippet,
      true,
      false,
      undefined,
      getBrandStyle('minimal'),
      'Male',
      undefined,
      undefined,
      undefined,
      {
        primaryImageSide: 'back',
        frontDescription:
          'large red cherry graphic centered on the chest with red brand text above it',
      },
    );

    expect(prompt).toContain('MISSING FRONT REFERENCE');
    expect(prompt).toContain('uploaded product photo is the BACK');
    expect(prompt).toContain('large red cherry graphic centered on the chest');
    expect(prompt).toContain('Do not copy back-only graphics');
  });
});
