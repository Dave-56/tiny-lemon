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

    expect(prompt).toContain('Natural three-quarter stance with relaxed asymmetry and shoulders softly turned.');
    expect(prompt).toContain('Hands stay fully visible and away from the waistband and garment.');
    expect(prompt).not.toContain('left hand rests lightly at waist');
    expect(prompt).not.toContain('deep in trouser pocket');
  });

  it('uses the safer default back copy when no brand style override is present', () => {
    const prompt = buildPromptFromSpec(spec, 'back', backdropSnippet);

    expect(prompt).toContain('Standing naturally from the rear angle with arms relaxed slightly away from the body.');
    expect(prompt).toContain('Hands remain visible from the rear angle when possible');
    expect(prompt).toContain('No distorted fingers, fused hands, or hidden hands unless intentionally requested.');
  });

  it('keeps the minimal preset inside the safe hand envelope', () => {
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

    expect(prompt).toContain('Both arms remain relaxed with a clear gap from the torso.');
    expect(prompt).toContain('Hands fully visible and away from the waistband.');
    expect(prompt).not.toContain('left hand rests lightly at waist');
  });

  it('keeps the accessible preset warm without reintroducing hip-touch language', () => {
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

    expect(prompt).toContain('genuine soft smile');
    expect(prompt).toContain('Both arms relaxed at the sides with hands fully visible and fingers open naturally.');
    expect(prompt).not.toContain('Left hand loosely at hip');
    expect(prompt).not.toContain('left hand lightly at hip');
  });

  it('keeps the premium male preset out of crossed-arm poses', () => {
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

    expect(prompt).toContain('Both arms dropped naturally at the sides with hands fully visible and relaxed.');
    expect(prompt).not.toContain('Arms crossed loosely at chest');
    expect(prompt).not.toContain('hands not in pockets');
  });

  it('keeps the editorial male preset out of pocket poses', () => {
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

    expect(prompt).toContain('Both arms hang naturally at the sides with hands fully visible and relaxed.');
    expect(prompt).not.toContain('deep in trouser pocket');
    expect(prompt).not.toContain('thumb hooked at edge');
  });

  it('keeps the street preset casual without pocket or hook language', () => {
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

    expect(prompt).toContain('Both arms remain relaxed with a clear gap from the torso.');
    expect(prompt).toContain('Hands fully visible and away from the waistband.');
    expect(prompt).not.toContain('Both hands deep in trouser pockets');
    expect(prompt).not.toContain('thumbs hooked at edge');
  });

  it('keeps the athletic preset out of stride-arm instructions', () => {
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

    expect(prompt).toContain('Both arms remain relaxed with a clear gap from the torso, hands fully visible and natural.');
    expect(prompt).not.toContain('mid-stride');
    expect(prompt).not.toContain('Right arm slightly forward');
    expect(prompt).not.toContain('Left arm slightly forward');
  });
});
