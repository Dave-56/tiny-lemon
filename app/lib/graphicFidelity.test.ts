import { describe, expect, it } from 'vitest';

import {
  getGraphicPromptContext,
  isGraphicCriticalSpec,
  mergeGraphicFidelityIntoSpec,
} from './graphicFidelity';
import type { GarmentSpec } from './garmentSpec';

const baseSpec: GarmentSpec = {
  garment_type: 't-shirt',
  hem_length: 'hip',
  sleeve_length: 'short',
  fit: 'relaxed',
  silhouette: 'straight',
  primary_colors: ['white'],
  has_logo_or_text: false,
  notable_details: '',
};

describe('graphic fidelity metadata', () => {
  it('treats typography and print details as graphic-critical even if boolean detection misses', () => {
    expect(isGraphicCriticalSpec({
      has_logo_or_text: false,
      notable_details: 'large red chest print with small typography',
    })).toBe(true);
  });

  it('merges raw-upload graphic details into the cleaned garment spec', () => {
    const merged = mergeGraphicFidelityIntoSpec(
      {
        ...baseSpec,
        notable_details: 'plain white tee',
      },
      {
        ...baseSpec,
        has_logo_or_text: true,
        notable_details: 'red cherry graphic with red brand text on chest',
      },
      'https://blob.example/graphic-reference-front.png',
    );

    expect(merged.has_logo_or_text).toBe(true);
    expect(merged.notable_details).toBe('red cherry graphic with red brand text on chest');
    expect(merged.graphicFidelity).toEqual({
      critical: true,
      description: 'red cherry graphic with red brand text on chest',
      referenceCropUrl: 'https://blob.example/graphic-reference-front.png',
    });
    expect(getGraphicPromptContext(merged)).toEqual({
      critical: true,
      description: 'red cherry graphic with red brand text on chest',
      hasReferenceCrop: true,
    });
  });
});
