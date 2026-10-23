import type {OnboardingDraft} from '../onboarding/types';

export type ProfileSaveInput = {
  draft: OnboardingDraft;
  original: OnboardingDraft;
  computedBalance: number;
  balanceText: string;
  balanceEdited: boolean;
};

export type ProfileSavePlan = {
  draft: OnboardingDraft;
  options: {targetWalletBalance?: number};
};

const toCents = (value: number) => Math.round(value * 100);

export function balanceFieldText(balance: number): string {
  return balance.toFixed(2);
}

function parseMoney(text: string): number | null {
  const trimmed = text.replace(/,/g, '').trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function planProfileSave({
  draft,
  original,
  computedBalance,
  balanceText,
  balanceEdited,
}: ProfileSaveInput): ProfileSavePlan {
  const saved = {...draft, currency: original.currency};
  const typed = balanceEdited ? parseMoney(balanceText) : null;
  if (typed === null || toCents(typed) === toCents(computedBalance)) {
    return {draft: saved, options: {}};
  }
  return {draft: saved, options: {targetWalletBalance: typed}};
}
