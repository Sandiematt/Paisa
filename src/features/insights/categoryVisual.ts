import type {GradientKey} from '../../theme';

/** Phosphor icon the screen renders for a category. Kept as a key so this file stays React-free. */
export type CategoryIconKey =
  | 'house'
  | 'dining'
  | 'cart'
  | 'bag'
  | 'car'
  | 'bolt'
  | 'health'
  | 'plane'
  | 'repeat'
  | 'book'
  | 'tag';

/** Colour family for a category's icon square and progress bar. */
export type CategoryTone = 'primary' | 'rose' | 'savings' | 'strip' | 'gold';

export type CategoryVisual = {
  icon: CategoryIconKey;
  tone: CategoryTone;
};

/** Named DX gradient for a tone, or null when the tone uses explicit stops (gold). */
export const TONE_GRADIENT: Record<CategoryTone, GradientKey | null> = {
  primary: 'primary',
  rose: 'rose',
  savings: 'savings',
  strip: 'budgetStrip',
  gold: null,
};

const BY_SLUG: Record<string, CategoryVisual> = {
  housing: {icon: 'house', tone: 'savings'},
  dining: {icon: 'dining', tone: 'rose'},
  groceries: {icon: 'cart', tone: 'primary'},
  shopping: {icon: 'bag', tone: 'strip'},
  transport: {icon: 'car', tone: 'savings'},
  bills: {icon: 'bolt', tone: 'gold'},
  health: {icon: 'health', tone: 'rose'},
  travel: {icon: 'plane', tone: 'savings'},
  subscriptions: {icon: 'repeat', tone: 'strip'},
  education: {icon: 'book', tone: 'primary'},
};

// Loose keyword fallbacks so user-made categories ("Eating out", "Petrol") still get a sensible icon.
const KEYWORDS: {pattern: RegExp; visual: CategoryVisual}[] = [
  {pattern: /\b(din|food|eat|restaurant|cafe|coffee|snack|lunch|dinner)/, visual: BY_SLUG.dining},
  {pattern: /\b(grocer|supermarket|vegetable|milk)/, visual: BY_SLUG.groceries},
  {pattern: /\b(shop|cloth|fashion|gadget)/, visual: BY_SLUG.shopping},
  {pattern: /\b(transport|fuel|petrol|diesel|taxi|metro|(?:bus|cab|auto|uber|ola)\b)/, visual: BY_SLUG.transport},
  {pattern: /\b(bill|electric|water|gas|internet|wifi|phone|recharge|utilit)/, visual: BY_SLUG.bills},
  {pattern: /\b(rent|home|house|housing|maintenance)/, visual: BY_SLUG.housing},
  {pattern: /\b(health|medic|doctor|pharma|gym|fitness)/, visual: BY_SLUG.health},
  {pattern: /\b(travel|trip|flight|hotel|holiday)/, visual: BY_SLUG.travel},
  {pattern: /\b(subscri|netflix|spotify|prime|member)/, visual: BY_SLUG.subscriptions},
  {pattern: /\b(educat|school|course|book|tuition|fees)/, visual: BY_SLUG.education},
];

const FALLBACK: CategoryVisual = {icon: 'tag', tone: 'primary'};

/** Maps a category (slug first, then name keywords) to its icon and colour tone. */
export function categoryVisual(slug: string | null | undefined, name: string): CategoryVisual {
  const bySlug = slug ? BY_SLUG[slug.toLowerCase()] : undefined;
  if (bySlug) return bySlug;
  const byName = BY_SLUG[name.trim().toLowerCase()];
  if (byName) return byName;
  const needle = name.trim().toLowerCase();
  const hit = KEYWORDS.find(entry => entry.pattern.test(needle));
  return hit ? hit.visual : FALLBACK;
}
