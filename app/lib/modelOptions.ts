import type { ModelAttributes } from './types';

export const OPTIONS = {
  ethnicities: [
    'Black / African Descent',
    'East Asian',
    'South Asian',
    'Hispanic / Latino',
    'Middle Eastern',
    'White / Caucasian',
    'Mixed / Multi-racial',
    'Indigenous / Native',
  ],
  skinTones: ['Fair / Porcelain', 'Light / Ivory', 'Medium / Olive', 'Tan / Bronze', 'Rich Caramel', 'Deep Ebony'],
  bodyBuilds: {
    Female: ['Slender / Slim', 'Athletic / Toned', 'Curvy / Hourglass', 'Petite', 'Pear Shaped', 'Average'],
    Male: ['Slender / Slim', 'Athletic / Toned', 'Muscular / Buff', 'Broad Shoulders', 'V-Taper', 'Average'],
    'Non-binary': ['Slender / Slim', 'Athletic / Toned', 'Petite', 'Muscular', 'Androgynous', 'Average'],
  } as Record<string, string[]>,
  heights: ['5\'2" (157cm)', '5\'5" (165cm)', '5\'8" (173cm)', '5\'10" (178cm)', '6\'0" (183cm)'],
  ageRanges: ['18–24', '25–34', '35–44', '45–54', '55+'],
  hairStyles: {
    Female: ['Pixie cut', 'Bob', 'Shoulder length', 'Long straight', 'Long wavy', 'Curly / Afro', 'Braids / Locs', 'Ponytail', 'Bun', 'Bald'],
    Male: ['Buzz cut', 'Crew cut', 'Undercut', 'Pompadour', 'Short messy', 'Man bun', 'Bald', 'Braids / Locs'],
    'Non-binary': ['Buzz cut', 'Pixie cut', 'Bob', 'Shoulder length', 'Long straight', 'Long wavy', 'Curly / Afro', 'Braids / Locs', 'Bald', 'Androgynous'],
  } as Record<string, string[]>,
  hairColors: ['Black', 'Dark Brown', 'Light Brown', 'Blonde', 'Red / Auburn', 'Grey / Silver', 'Platinum Blonde'],
};

export const SKIN_TONE_COLORS: Record<string, string> = {
  'Fair / Porcelain': '#FAD7B1',
  'Light / Ivory': '#F1C27D',
  'Medium / Olive': '#E0AC69',
  'Tan / Bronze': '#C68642',
  'Rich Caramel': '#8D5524',
  'Deep Ebony': '#3C2E28',
};

export const ETHNICITY_PRESETS: Record<string, Record<string, Partial<ModelAttributes>>> = {
  'Black / African Descent': {
    Female: { skinTone: 'Deep Ebony', hairStyle: 'Braids / Locs', hairColor: 'Black', bodyBuild: 'Curvy / Hourglass', height: '5\'10" (178cm)' },
    Male: { skinTone: 'Deep Ebony', hairStyle: 'Buzz cut', hairColor: 'Black', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Deep Ebony', hairStyle: 'Braids / Locs', hairColor: 'Black', bodyBuild: 'Athletic / Toned', height: '5\'8" (173cm)' },
  },
  'East Asian': {
    Female: { skinTone: 'Fair / Porcelain', hairStyle: 'Long straight', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Fair / Porcelain', hairStyle: 'Short messy', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Fair / Porcelain', hairStyle: 'Bob', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
  },
  'South Asian': {
    Female: { skinTone: 'Tan / Bronze', hairStyle: 'Long wavy', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Tan / Bronze', hairStyle: 'Short messy', hairColor: 'Black', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Tan / Bronze', hairStyle: 'Shoulder length', hairColor: 'Black', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
  'Hispanic / Latino': {
    Female: { skinTone: 'Medium / Olive', hairStyle: 'Long wavy', hairColor: 'Dark Brown', bodyBuild: 'Curvy / Hourglass', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Medium / Olive', hairStyle: 'Short messy', hairColor: 'Dark Brown', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Medium / Olive', hairStyle: 'Shoulder length', hairColor: 'Dark Brown', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
  'Middle Eastern': {
    Female: { skinTone: 'Medium / Olive', hairStyle: 'Long wavy', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Medium / Olive', hairStyle: 'Short messy', hairColor: 'Black', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Medium / Olive', hairStyle: 'Shoulder length', hairColor: 'Black', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
  'White / Caucasian': {
    Female: { skinTone: 'Light / Ivory', hairStyle: 'Long wavy', hairColor: 'Blonde', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Light / Ivory', hairStyle: 'Short messy', hairColor: 'Light Brown', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Light / Ivory', hairStyle: 'Shoulder length', hairColor: 'Light Brown', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
  'Mixed / Multi-racial': {
    Female: { skinTone: 'Tan / Bronze', hairStyle: 'Curly / Afro', hairColor: 'Dark Brown', bodyBuild: 'Athletic / Toned', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Tan / Bronze', hairStyle: 'Short messy', hairColor: 'Dark Brown', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Tan / Bronze', hairStyle: 'Curly / Afro', hairColor: 'Dark Brown', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
  'Indigenous / Native': {
    Female: { skinTone: 'Tan / Bronze', hairStyle: 'Long straight', hairColor: 'Black', bodyBuild: 'Slender / Slim', height: '5\'5" (165cm)' },
    Male: { skinTone: 'Tan / Bronze', hairStyle: 'Long straight', hairColor: 'Black', bodyBuild: 'Athletic / Toned', height: '5\'10" (178cm)' },
    'Non-binary': { skinTone: 'Tan / Bronze', hairStyle: 'Long straight', hairColor: 'Black', bodyBuild: 'Average', height: '5\'5" (165cm)' },
  },
};
