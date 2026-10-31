import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {UpdateBanner} from '../src/features/updates/UpdateBanner';
import {OtaUpdate, useOtaUpdate} from '../src/features/updates/useOtaUpdate';
import {
  OtaStatus,
  TimeoutError,
  runUpdateCheck,
  shouldRecheck,
  withTimeout,
} from '../src/lib/updates/otaUpdate';
import {ThemeProvider} from '../src/theme';

jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => true}));

const available = {
  isAvailable: true as const,
  isRollBackToEmbedded: false as const,
  manifest: {} as never,
  reason: undefined,
};
const none = {
  isAvailable: false as const,
  isRollBackToEmbedded: false as const,
  manifest: undefined,
  reason: 'noUpdateAvailableOnServer' as never,
};
const rollBack = {
  isAvailable: false as const,
  isRollBackToEmbedded: true as const,
  manifest: undefined,
  reason: undefined,
};
const fetchedNew = {
  isNew: true as const,
  isRollBackToEmbedded: false as const,
  manifest: {} as never,
};
const fetchedRollBack = {
  isNew: false as const,
  isRollBackToEmbedded: true as const,
  manifest: undefined,
};

function fakeApi(overrides: Partial<ReturnType<typeof baseApi>> = {}) {
  return {...baseApi(), ...overrides};
}
function baseApi() {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(async () => available) as jest.Mock,
    fetchUpdateAsync: jest.fn(async () => fetchedNew) as jest.Mock,
    reloadAsync: jest.fn(async () => {}) as jest.Mock,
  };
}

const quiet = () => {};

describe('runUpdateCheck', () => {
  test('downloads an available update and ends ready', async () => {
    const api = fakeApi();
    const seen: OtaStatus[] = [];
    const result = await runUpdateCheck(api, s => seen.push(s), {log: quiet});
    expect(result).toBe('ready');
    expect(seen).toEqual(['checking', 'downloading', 'ready']);
    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  test('does nothing when expo-updates is disabled', async () => {
    const api = fakeApi({isEnabled: false});
    const onStatus = jest.fn();
    expect(await runUpdateCheck(api, onStatus, {log: quiet})).toBe('idle');
    expect(onStatus).not.toHaveBeenCalled();
    expect(api.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  test('stays idle when the server has nothing new', async () => {
    const api = fakeApi({checkForUpdateAsync: jest.fn(async () => none)});
    const seen: OtaStatus[] = [];
    expect(await runUpdateCheck(api, s => seen.push(s), {log: quiet})).toBe(
      'idle',
    );
    expect(seen).toEqual(['checking', 'idle']);
    expect(api.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  test('stages a roll-back to the embedded bundle', async () => {
    const api = fakeApi({
      checkForUpdateAsync: jest.fn(async () => rollBack),
      fetchUpdateAsync: jest.fn(async () => fetchedRollBack),
    });
    expect(await runUpdateCheck(api, quiet, {log: quiet})).toBe('ready');
  });

  test('a fetch that brings nothing new ends idle', async () => {
    const api = fakeApi({
      fetchUpdateAsync: jest.fn(async () => ({
        isNew: false,
        isRollBackToEmbedded: false,
        manifest: undefined,
      })),
    });
    expect(await runUpdateCheck(api, quiet, {log: quiet})).toBe('idle');
  });

  test('offline check failure is logged and swallowed', async () => {
    const error = new Error('Network request failed');
    const api = fakeApi({
      checkForUpdateAsync: jest.fn(async () => {
        throw error;
      }),
    });
    const log = jest.fn();
    const seen: OtaStatus[] = [];
    expect(await runUpdateCheck(api, s => seen.push(s), {log})).toBe('idle');
    expect(seen).toEqual(['checking', 'idle']);
    expect(log).toHaveBeenCalledWith('check failed', error);
  });

  test('download failure is logged and swallowed', async () => {
    const api = fakeApi({
      fetchUpdateAsync: jest.fn(async () => {
        throw new Error('disk full');
      }),
    });
    const log = jest.fn();
    const seen: OtaStatus[] = [];
    expect(await runUpdateCheck(api, s => seen.push(s), {log})).toBe('idle');
    expect(seen).toEqual(['checking', 'downloading', 'idle']);
    expect(log).toHaveBeenCalledWith('download failed', expect.any(Error));
  });

  test('a hung check times out', async () => {
    jest.useFakeTimers();
    try {
      const api = fakeApi({
        checkForUpdateAsync: jest.fn(() => new Promise<never>(() => {})),
      });
      const log = jest.fn();
      const pending = runUpdateCheck(api, quiet, {log, checkTimeoutMs: 500});
      jest.advanceTimersByTime(500);
      expect(await pending).toBe('idle');
      expect(log.mock.calls[0][1]).toBeInstanceOf(TimeoutError);
      expect(api.fetchUpdateAsync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a hung download times out', async () => {
    jest.useFakeTimers();
    try {
      const api = fakeApi({
        fetchUpdateAsync: jest.fn(() => new Promise<never>(() => {})),
      });
      const log = jest.fn();
      const pending = runUpdateCheck(api, quiet, {log, fetchTimeoutMs: 500});
      // Let the check resolve before the download timer starts.
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);
      expect(await pending).toBe('idle');
      expect(log).toHaveBeenCalledWith(
        'download failed',
        expect.any(TimeoutError),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('withTimeout', () => {
  test('passes through a value that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(3), 50, 'x')).resolves.toBe(3);
  });

  test('passes through a rejection that arrives in time', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 50, 'x'),
    ).rejects.toThrow('boom');
  });
});

describe('shouldRecheck', () => {
  test('rechecks when idle and never checked or the interval passed', () => {
    expect(shouldRecheck('idle', null, 0)).toBe(true);
    expect(shouldRecheck('idle', 0, 1000, 1000)).toBe(true);
    expect(shouldRecheck('idle', 0, 999, 1000)).toBe(false);
  });

  test('never rechecks while busy or with an update staged', () => {
    expect(shouldRecheck('checking', null, 0)).toBe(false);
    expect(shouldRecheck('downloading', null, 0)).toBe(false);
    expect(shouldRecheck('ready', null, 0)).toBe(false);
  });
});

describe('useOtaUpdate', () => {
  let current: OtaUpdate;
  function Probe(props: Parameters<typeof useOtaUpdate>[0]) {
    current = useOtaUpdate(props);
    return null;
  }

  async function mount(props: Parameters<typeof useOtaUpdate>[0]) {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(<Probe {...props} />);
    });
    return tree;
  }

  let appStateListener: ((state: AppStateStatus) => void) | null;
  beforeEach(() => {
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_type, listener) => {
        appStateListener = listener as (state: AppStateStatus) => void;
        return {remove: jest.fn()} as never;
      },
    );
  });
  afterEach(() => jest.restoreAllMocks());

  test('is a no-op when disabled (development, expo-updates off)', async () => {
    const api = fakeApi();
    await mount({api, enabled: false, log: quiet});
    expect(current.status).toBe('idle');
    expect(api.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  test('checks on launch and becomes ready without reloading', async () => {
    const api = fakeApi();
    await mount({api, enabled: true, log: quiet});
    expect(current.status).toBe('ready');
    expect(api.reloadAsync).not.toHaveBeenCalled();
  });

  test('restart reloads only when asked', async () => {
    const api = fakeApi();
    await mount({api, enabled: true, log: quiet});
    await act(async () => {
      await current.restart();
    });
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
  });

  test('a failed reload hides the banner instead of throwing', async () => {
    const api = fakeApi({
      reloadAsync: jest.fn(async () => {
        throw new Error('no runtime');
      }),
    });
    const log = jest.fn();
    await mount({api, enabled: true, log});
    await act(async () => {
      await current.restart();
    });
    expect(current.dismissed).toBe(true);
    expect(log).toHaveBeenCalledWith('reload failed', expect.any(Error));
  });

  test('dismiss hides it for the session', async () => {
    await mount({api: fakeApi(), enabled: true, log: quiet});
    act(() => current.dismiss());
    expect(current.dismissed).toBe(true);
    expect(current.status).toBe('ready');
  });

  test('re-checks on foreground only after the interval', async () => {
    let clock = 1_000;
    const api = fakeApi({checkForUpdateAsync: jest.fn(async () => none)});
    await mount({api, enabled: true, log: quiet, now: () => clock});
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    clock += 60_000;
    await act(async () => appStateListener?.('active'));
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    clock += 5 * 60 * 60 * 1000;
    await act(async () => appStateListener?.('background'));
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  test('swallows a failed check and stays idle', async () => {
    const api = fakeApi({
      checkForUpdateAsync: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    await mount({api, enabled: true, log: quiet});
    expect(current.status).toBe('idle');
  });
});

describe('UpdateBanner', () => {
  const metrics = {
    frame: {x: 0, y: 0, width: 390, height: 844},
    insets: {top: 47, left: 0, right: 0, bottom: 34},
  };
  const base: OtaUpdate = {
    status: 'idle',
    dismissed: false,
    restart: jest.fn(async () => {}),
    dismiss: jest.fn(),
  };

  async function render(props: Partial<OtaUpdate> & {visible?: boolean}) {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ThemeProvider>
            <UpdateBanner {...base} {...props} />
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });
    return tree;
  }

  const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);

  test('renders nothing while idle', async () => {
    const tree = await render({status: 'idle'});
    expect(texts(tree)).toEqual([]);
  });

  test('stays hidden behind the splash', async () => {
    const tree = await render({status: 'ready', visible: false});
    expect(texts(tree)).toEqual([]);
  });

  test('shows download progress without a restart button', async () => {
    const tree = await render({status: 'downloading'});
    expect(texts(tree)).toContain('Downloading update');
    expect(texts(tree)).not.toContain('Restart');
  });

  test('offers Restart when ready and calls restart on tap', async () => {
    const restart = jest.fn(async () => {});
    const tree = await render({status: 'ready', restart});
    expect(texts(tree)).toContain('Update ready');
    const button = tree.root.findAllByProps({
      accessibilityLabel: 'Restart Paisa to apply the update',
    })[0];
    await act(async () => {
      button.props.onPress();
    });
    expect(restart).toHaveBeenCalledTimes(1);
  });

  test('the close button dismisses', async () => {
    const dismiss = jest.fn();
    const tree = await render({status: 'ready', dismiss});
    const close = tree.root.findAllByProps({
      accessibilityLabel: 'Later, apply the update next launch',
    })[0];
    act(() => close.props.onPress());
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  test.each(['light', 'dark'])('renders in the %s theme', async scheme => {
    await AsyncStorage.setItem('paisa.colorScheme', scheme);
    try {
      const tree = await render({status: 'ready'});
      expect(texts(tree)).toContain('Restart');
    } finally {
      await AsyncStorage.removeItem('paisa.colorScheme');
    }
  });
});
