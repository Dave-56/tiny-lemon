import { describe, expect, it } from 'vitest';

import {
  getGraphicPromptContext,
  getGraphicPromptContextForPose,
  getGraphicReferenceForPose,
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
      'https://blob.example/raw-front.png',
    );

    expect(merged.has_logo_or_text).toBe(true);
    expect(merged.notable_details).toBe('red cherry graphic with red brand text on chest');
    expect(merged.graphicFidelity).toEqual({
      critical: true,
      description: 'red cherry graphic with red brand text on chest',
      references: [
        {
          sourceSide: 'front',
          description: 'red cherry graphic with red brand text on chest',
          rawReferenceUrl: 'https://blob.example/raw-front.png',
          referenceCropUrl: 'https://blob.example/graphic-reference-front.png',
        },
      ],
      rawReferenceUrl: 'https://blob.example/raw-front.png',
      referenceCropUrl: 'https://blob.example/graphic-reference-front.png',
    });
    expect(getGraphicPromptContext(merged)).toEqual({
      critical: true,
      sourceSide: 'front',
      description: 'red cherry graphic with red brand text on chest',
      rawReferenceUrl: 'https://blob.example/raw-front.png',
      referenceCropUrl: 'https://blob.example/graphic-reference-front.png',
      hasRawReference: true,
      hasReferenceCrop: true,
    });
  });

  it('routes back-only graphic references only to back poses', () => {
    const merged = mergeGraphicFidelityIntoSpec(
      {
        ...baseSpec,
        notable_details: 'plain front with right chest pocket',
      },
      {
        ...baseSpec,
        has_logo_or_text: true,
        notable_details: 'large red cherry graphic with red brand text on back',
      },
      'https://blob.example/graphic-reference-back.png',
      'https://blob.example/raw-back.png',
      'back',
    );

    expect(getGraphicReferenceForPose(merged, 'front')).toBeUndefined();
    expect(getGraphicReferenceForPose(merged, 'three-quarter')).toBeUndefined();
    expect(getGraphicReferenceForPose(merged, 'back')).toEqual({
      sourceSide: 'back',
      description: 'large red cherry graphic with red brand text on back',
      rawReferenceUrl: 'https://blob.example/raw-back.png',
      referenceCropUrl: 'https://blob.example/graphic-reference-back.png',
    });
    expect(getGraphicPromptContextForPose(merged, 'front')).toEqual({
      critical: false,
    });
    expect(getGraphicPromptContextForPose(merged, 'three-quarter')).toEqual({
      critical: false,
    });
    expect(getGraphicPromptContextForPose(merged, 'back')).toEqual({
      critical: true,
      sourceSide: 'back',
      description: 'large red cherry graphic with red brand text on back',
      rawReferenceUrl: 'https://blob.example/raw-back.png',
      referenceCropUrl: 'https://blob.example/graphic-reference-back.png',
      hasRawReference: true,
      hasReferenceCrop: true,
    });
  });
});
