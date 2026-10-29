import {RouteName} from './routes';

export const LOADING_KEY = 'loading';
export const SETUP_KEY = 'setup';
export const HOME_KEY = 'home';
export const UPGRADE_KEY = 'upgrade';

/**
 * Which screen is on stage. While a fresh sign-in loads its profile, the
 * screen the user signed in from stays put (its button is already busy), so
 * it slides straight to Home with no splash in between. The splash only
 * covers a cold start, before auth has been read.
 */
export function swapKeyFor(state: {
  ready: boolean;
  signedIn: boolean;
  profileReady: boolean;
  hasDraft: boolean;
  needsSetup: boolean;
  /** An account from before the latest setup steps, not caught up yet. */
  needsUpgrade?: boolean;
  route: RouteName;
}): string {
  const loading = !state.ready || (state.signedIn && !state.profileReady);
  if (loading) {
    return state.route === 'splash' ? LOADING_KEY : state.route;
  }
  if (state.signedIn && state.hasDraft) {
    if (state.needsSetup) {
      return SETUP_KEY;
    }
    return state.needsUpgrade ? UPGRADE_KEY : HOME_KEY;
  }
  return state.route;
}
