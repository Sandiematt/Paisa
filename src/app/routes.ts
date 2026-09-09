export const ROUTES = [
  'splash',
  'authChoice',
  'login',
  'onboarding',
  'home',
] as const;

export type RouteName = (typeof ROUTES)[number];
