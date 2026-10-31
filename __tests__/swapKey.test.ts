import {swapKeyFor} from '../src/app/swapKey';

const base = {
  ready: true,
  signedIn: false,
  profileReady: true,
  hasDraft: false,
  needsSetup: false,
  route: 'login' as const,
};

describe('swapKeyFor', () => {
  it('keeps the sign-in screen up while the profile loads, then goes straight home', () => {
    // Just signed in: profile still loading.
    expect(swapKeyFor({...base, signedIn: true, profileReady: false})).toBe(
      'login',
    );
    // Profile loaded.
    expect(swapKeyFor({...base, signedIn: true, hasDraft: true})).toBe('home');
  });

  it('never passes through the splash after signing in from any auth screen', () => {
    for (const route of ['login', 'authChoice', 'onboarding'] as const) {
      expect(
        swapKeyFor({...base, route, signedIn: true, profileReady: false}),
      ).toBe(route);
    }
  });

  it('shows the loading splash only on a cold start', () => {
    expect(swapKeyFor({...base, route: 'splash', ready: false})).toBe(
      'loading',
    );
    expect(
      swapKeyFor({
        ...base,
        route: 'splash',
        signedIn: true,
        profileReady: false,
      }),
    ).toBe('loading');
  });

  it('sends a Google sign-up without a profile to setup', () => {
    expect(
      swapKeyFor({...base, signedIn: true, hasDraft: true, needsSetup: true}),
    ).toBe('setup');
  });

  it('catches an older account up before home, after any first-time setup', () => {
    const signedIn = {...base, signedIn: true, hasDraft: true};
    expect(swapKeyFor({...signedIn, needsUpgrade: true})).toBe('upgrade');
    expect(swapKeyFor({...signedIn, needsUpgrade: true, needsSetup: true})).toBe(
      'setup',
    );
  });

  it('shows the current auth route when signed out', () => {
    expect(swapKeyFor(base)).toBe('login');
    expect(swapKeyFor({...base, route: 'splash'})).toBe('splash');
  });
});
