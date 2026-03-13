export type BrandEnergy =
  | 'minimal'
  | 'accessible'
  | 'editorial'
  | 'premium'
  | 'street'
  | 'athletic';

export type PrimaryCategory =
  | 'womenswear'
  | 'menswear'
  | 'unisex'
  | 'activewear'
  | 'streetwear'
  | 'formalwear'
  | 'other';

export const BRAND_ENERGIES: { id: BrandEnergy; label: string; description: string }[] = [
  { id: 'minimal',    label: 'Minimal Clarity',       description: 'Clean, composed, timeless. COS, Uniqlo, Arket.' },
  { id: 'accessible', label: 'Accessible Warmth',      description: 'Approachable, friendly, non-intimidating. H&M, ASOS, Next.' },
  { id: 'editorial',  label: 'Editorial Cool',         description: 'Effortless cool, slightly unposed. Zara, Mango, Reformation.' },
  { id: 'premium',    label: 'Premium Poise',          description: 'Quiet confidence, elevated bearing. Sandro, Reiss, Ted Baker.' },
  { id: 'street',     label: 'Street Energy',          description: 'Casual, self-expressive, urban. Urban Outfitters, Carhartt, Weekday.' },
  { id: 'athletic',   label: 'Athletic Performance',   description: 'Strong, functional, activewear-first. Lululemon, Gymshark, Alo Yoga.' },
];

export const PRIMARY_CATEGORIES: { id: PrimaryCategory; label: string }[] = [
  { id: 'womenswear',  label: 'Womenswear' },
  { id: 'menswear',    label: 'Menswear' },
  { id: 'unisex',      label: 'Unisex / Gender-neutral' },
  { id: 'activewear',  label: 'Activewear' },
  { id: 'streetwear',  label: 'Streetwear' },
  { id: 'formalwear',  label: 'Formalwear' },
  { id: 'other',       label: 'Other / Mixed' },
];

// Fallback when no brand profile is set, or category is "other"
export const FALLBACK_DIRECTIONS: BrandEnergy[] = ['minimal', 'accessible', 'editorial'];

type DirectionMap = Record<BrandEnergy, BrandEnergy[]>;

const MAPPING: Record<Exclude<PrimaryCategory, 'other'>, DirectionMap> = {
  womenswear: {
    minimal:    ['minimal', 'premium', 'editorial'],
    accessible: ['accessible', 'minimal', 'editorial'],
    editorial:  ['editorial', 'minimal', 'premium'],
    premium:    ['premium', 'minimal', 'editorial'],
    street:     ['street', 'editorial', 'accessible'],
    athletic:   ['athletic', 'street', 'minimal'],
  },
  menswear: {
    minimal:    ['minimal', 'premium', 'editorial'],
    accessible: ['accessible', 'minimal'],
    editorial:  ['editorial', 'minimal', 'street'],
    premium:    ['premium', 'minimal', 'editorial'],
    street:     ['street', 'editorial', 'accessible'],
    athletic:   ['athletic', 'street'],
  },
  unisex: {
    minimal:    ['minimal', 'accessible', 'editorial'],
    accessible: ['accessible', 'minimal'],
    editorial:  ['editorial', 'minimal', 'accessible'],
    premium:    ['premium', 'minimal'],
    street:     ['street', 'editorial'],
    athletic:   ['athletic', 'street', 'minimal'],
  },
  activewear: {
    minimal:    ['athletic', 'minimal'],
    accessible: ['athletic', 'accessible'],
    editorial:  ['athletic', 'editorial'],
    premium:    ['athletic', 'premium'],
    street:     ['athletic', 'street'],
    athletic:   ['athletic', 'street'],
  },
  streetwear: {
    minimal:    ['street', 'minimal'],
    accessible: ['street', 'accessible'],
    editorial:  ['street', 'editorial'],
    premium:    ['street', 'premium'],
    street:     ['street', 'editorial', 'accessible'],
    athletic:   ['street', 'athletic'],
  },
  formalwear: {
    minimal:    ['premium', 'minimal'],
    accessible: ['premium', 'accessible'],
    editorial:  ['premium', 'editorial'],
    premium:    ['premium', 'minimal', 'editorial'],
    street:     ['premium', 'editorial'],
    athletic:   ['premium', 'minimal'],
  },
};

export function getRecommendedDirections(
  brandEnergy: string | null | undefined,
  primaryCategory: string | null | undefined,
): BrandEnergy[] {
  if (!brandEnergy || !primaryCategory || primaryCategory === 'other') {
    return FALLBACK_DIRECTIONS;
  }
  const categoryMap = MAPPING[primaryCategory as Exclude<PrimaryCategory, 'other'>];
  if (!categoryMap) return FALLBACK_DIRECTIONS;
  return categoryMap[brandEnergy as BrandEnergy] ?? FALLBACK_DIRECTIONS;
}

export function getDefaultStylingDirection(
  brandEnergy: string | null | undefined,
  primaryCategory: string | null | undefined,
): BrandEnergy {
  return getRecommendedDirections(brandEnergy, primaryCategory)[0];
}
