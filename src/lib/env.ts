/**
 * Publishable client credentials for the Supabase project.
 * Expo injects `EXPO_PUBLIC_*` from `.env` at bundle time.
 * Rotate the dashboard keys in `.env` (and these fallbacks) together.
 */
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://ygmvrltpasoxltgqsjpv.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  'sb_publishable_XVKh7--8sYP-FTcF9T5Brg_kwzDp0Nz';
