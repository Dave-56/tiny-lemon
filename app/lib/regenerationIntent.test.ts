import { describe, expect, it } from 'vitest';

import {
  buildRegenerationIntentPromptBlock,
  normalizeRegenerationIntent,
} from './regenerationIntent';

describe('normalizeRegenerationIntent', () => {
  it('treats lighting and background requests as low-risk styling edits', () => {
    const intent = normalizeRegenerationIntent({
      userDirection: 'Warmer lighting, less shadow, light neutral grey studio backdrop',
      targetPoses: ['front'],
    });

    expect(intent).toMatchObject({
      targetImages: 'front',
      editSubject: 'lighting_background',
      riskLevel: 'low',
      clarificationNeeded: false,
    });
    expect(intent?.preservationRules.join(' ')).toContain(
      'Preserve the merchant product exactly',
    );
  });

  it('protects merchant product graphics when no-logo language is aimed at styling items', () => {
    const intent = normalizeRegenerationIntent({
      userDirection:
        'Forest green cap, white socks, clean white retro trainers (NO TRADEMARKS, NO LOGOS)',
      targetPoses: ['back'],
    });

    expect(intent?.riskLevel).toBe('medium');
    expect(intent?.reasons).toContain('no_logo_language');
    expect(intent?.preservationRules.join(' ')).toContain(
      'Never remove or alter the merchant product graphic/logo/text',
    );
  });

  it('strengthens preservation when the merchant explicitly asks to keep graphics exact', () => {
    const block = buildRegenerationIntentPromptBlock({
      userDirection:
        'keep graphic design exactly as it is, relaxed navy shorts, hands resting on hips',
      targetPoses: ['back'],
    });

    expect(block).toContain('STRUCTURED REGENERATION INTENT');
    expect(block).toContain('Target image(s): back.');
    expect(block).toContain('keep graphic design exactly as it is');
    expect(block).toContain('Prioritize exact graphic fidelity');
  });

  it('marks possible product edits as high risk so only safe parts are applied', () => {
    const intent = normalizeRegenerationIntent({
      userDirection: 'remove the logo from the shirt and make the background white',
      targetPoses: ['front'],
    });

    expect(intent?.riskLevel).toBe('high');
    expect(intent?.clarificationNeeded).toBe(true);
    expect(intent?.reasons).toContain('possible_product_change');
  });
});
