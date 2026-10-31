/** What a new password needs. Signing in with an older, weaker one still works. */
export type PasswordRule = {
  id: 'length' | 'upper' | 'lower' | 'digit' | 'symbol';
  label: string;
  test: (password: string) => boolean;
};

export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: password => password.length >= MIN_PASSWORD_LENGTH,
  },
  {id: 'upper', label: 'A capital letter', test: password => /[A-Z]/.test(password)},
  {id: 'lower', label: 'A small letter', test: password => /[a-z]/.test(password)},
  {id: 'digit', label: 'A number (0-9)', test: password => /\d/.test(password)},
  {
    id: 'symbol',
    label: 'A symbol, like @ # $ !',
    test: password => /[^A-Za-z0-9\s]/.test(password),
  },
];

export function passwordMeetsRules(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}

/** The first rule a password misses, for a one-line error; null when it passes. */
export function firstMissedRule(password: string): PasswordRule | null {
  return PASSWORD_RULES.find(rule => !rule.test(password)) ?? null;
}
