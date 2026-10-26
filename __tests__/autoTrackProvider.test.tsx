import React from 'react';
import {NativeModules, Platform, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  AutoTrackProvider,
  AutoTrackValue,
  useAutoTrack,
} from '../src/features/autotrack/AutoTrackProvider';
import {PendingTxn} from '../src/lib/autotrack/types';
import {upsertDetectedTransaction} from '../src/lib/transactionsStore';

let mockUser: {id: string} | null = {id: 'user-1'};
jest.mock('../src/features/auth/AuthProvider', () => ({
  useAuth: () => ({user: mockUser}),
}));

jest.mock('../src/lib/transactionsStore', () => ({
  ...jest.requireActual('../src/lib/transactionsStore'),
  upsertDetectedTransaction: jest.fn(),
}));

type Stub = Record<string, jest.Mock>;
const stub = NativeModules.UpiDetector as unknown as Stub;
const upsert = upsertDetectedTransaction as jest.Mock;

function pending(id: number): PendingTxn {
  return {
    id,
    sourceApp: 'com.phonepe.app',
    amount: '10.00',
    status: 'SUCCESS',
    direction: 'DEBIT',
    merchant: null,
    upiRef: null,
    detectedAtMillis: Date.now(),
    updatedAtMillis: 0,
    flag: null,
    flagReason: null,
    possibleDuplicateOfId: null,
    note: null,
    synced: false,
    dirty: true,
    remoteId: null,
    syncedAtMillis: null,
    externalRef: `upi:install:${id}`,
    alreadySynced: false,
  };
}

let current: AutoTrackValue;
function Probe() {
  current = useAutoTrack();
  return <Text>child</Text>;
}

async function mount() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AutoTrackProvider>
        <Probe />
      </AutoTrackProvider>,
    );
  });
  return tree;
}

describe('AutoTrackProvider', () => {
  beforeEach(() => {
    mockUser = {id: 'user-1'};
    upsert.mockReset();
    for (const fn of Object.values(stub)) {
      fn.mockClear();
    }
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  it('renders children and stays inert when unsupported', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const tree = await mount();
    expect(tree.root.findByType(Text).props.children).toBe('child');
    expect(current.supported).toBe(false);
    expect(current.loading).toBe(false);
    expect(current.transactions).toEqual([]);
    expect(stub.getPending).not.toHaveBeenCalled();
    expect(stub.setPreferences).not.toHaveBeenCalled();
    await act(async () => {
      await current.syncNow();
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('pushes stored prefs to native on sign-in and drains pending payments', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    stub.getPending.mockResolvedValueOnce(
      JSON.stringify([pending(1), pending(2)]),
    );
    upsert.mockImplementation(async (item: PendingTxn) => {
      if (item.id === 2) {
        throw new Error('offline');
      }
      return 'remote-1';
    });

    await mount();

    expect(current.supported).toBe(true);
    expect(stub.setPreferences).toHaveBeenCalledWith(
      '{"notesEnabled":true,"blockingEnabled":true}',
    );
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][1]).toBe('user-1');
    expect(stub.ackSynced).toHaveBeenCalledTimes(1);
    expect(stub.ackSynced).toHaveBeenCalledWith(
      '[{"id":1,"remoteId":"remote-1"}]',
    );
    expect(current.syncNonce).toBe(1);
    expect(current.lastSyncAt).toBeNull();
  });

  it('does not bump syncNonce when nothing was saved', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    expect(current.syncNonce).toBe(0);
    expect(stub.ackSynced).not.toHaveBeenCalled();
    expect(current.lastSyncAt).not.toBeNull();
  });

  it('updates prefs optimistically and mirrors them to native', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    stub.setPreferences.mockClear();
    await act(async () => {
      current.updatePrefs({blockingEnabled: false});
    });
    expect(current.prefs).toEqual({notesEnabled: true, blockingEnabled: false});
    expect(stub.setPreferences).toHaveBeenCalledWith(
      '{"notesEnabled":true,"blockingEnabled":false}',
    );
  });

  it('builds the allowance from the pushed snapshot and unsynced detections', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    expect(current.allowance).toBeNull();

    await act(async () => {
      current.setBudgetInputs({transactions: [], monthlyBudget: 31000});
    });
    expect(stub.setBudgetSnapshot).toHaveBeenCalledTimes(1);
    expect(current.allowance?.spentToday).toBe(0);

    // Identical inputs are not pushed again.
    await act(async () => {
      current.setBudgetInputs({transactions: [], monthlyBudget: 31000});
    });
    expect(stub.setBudgetSnapshot).toHaveBeenCalledTimes(1);
  });

  it('forgets native state on sign-out but not on a cold start', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockUser = null;
    const tree = await mount();
    expect(stub.clearUserData).not.toHaveBeenCalled();

    mockUser = {id: 'user-1'};
    await act(async () => {
      tree.update(
        <AutoTrackProvider>
          <Probe />
        </AutoTrackProvider>,
      );
    });
    expect(stub.clearUserData).not.toHaveBeenCalled();

    mockUser = null;
    await act(async () => {
      tree.update(
        <AutoTrackProvider>
          <Probe />
        </AutoTrackProvider>,
      );
    });
    expect(stub.clearUserData).toHaveBeenCalledTimes(1);
    expect(stub.clearUserData).toHaveBeenCalledWith(false);
    expect(stub.setOwner).toHaveBeenLastCalledWith(null);
    expect(stub.setOwner.mock.invocationCallOrder[1]).toBeLessThan(
      stub.clearUserData.mock.invocationCallOrder[0],
    );
  });

  it('sets the owner before reading or draining anything', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    stub.getPending.mockResolvedValueOnce(JSON.stringify([pending(1)]));
    upsert.mockResolvedValue('remote-1');
    await mount();

    expect(stub.setOwner).toHaveBeenCalledWith('user-1');
    const ownerAt = stub.setOwner.mock.invocationCallOrder[0];
    for (const name of ['getTransactions', 'getPending', 'ackSynced']) {
      expect(stub[name].mock.calls.length).toBeGreaterThan(0);
      for (const order of stub[name].mock.invocationCallOrder) {
        expect(order).toBeGreaterThan(ownerAt);
      }
    }
  });

  it('reads and drains nothing when native refuses the owner', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    stub.setOwner.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(stub.getTransactions).not.toHaveBeenCalled();
    expect(stub.getPending).not.toHaveBeenCalled();
    expect(current.loading).toBe(false);
    expect(current.prefsLoaded).toBe(false);
  });

  it('does not drain while signed out', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockUser = null;
    await mount();
    expect(stub.getPending).not.toHaveBeenCalled();
    await act(async () => {
      await current.syncNow();
    });
    expect(stub.getPending).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not ack a drain that finishes after switching to another user', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let release!: (id: string) => void;
    upsert.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          release = resolve;
        }),
    );
    stub.getPending.mockResolvedValueOnce(JSON.stringify([pending(1)]));
    const tree = await mount();
    expect(upsert).toHaveBeenCalledTimes(1);

    mockUser = {id: 'user-2'};
    await act(async () => {
      tree.update(
        <AutoTrackProvider>
          <Probe />
        </AutoTrackProvider>,
      );
    });
    await act(async () => {
      release('remote-for-user-1');
    });

    expect(stub.setOwner).toHaveBeenLastCalledWith('user-2');
    expect(stub.ackSynced).not.toHaveBeenCalled();
    expect(current.syncNonce).toBe(0);
  });

  it('ignores updatePrefs until the stored prefs have loaded', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <AutoTrackProvider>
          <Probe />
        </AutoTrackProvider>,
      );
    });
    expect(current.prefsLoaded).toBe(false);
    act(() => {
      current.updatePrefs({notesEnabled: false});
    });
    expect(current.prefs.notesEnabled).toBe(true);
    expect(stub.setPreferences).not.toHaveBeenCalledWith(
      '{"notesEnabled":false,"blockingEnabled":true}',
    );

    await act(async () => {});
    expect(current.prefsLoaded).toBe(true);
    act(() => {
      tree.unmount();
    });
  });

  it('reads the log only while log streaming is on', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    expect(stub.getLog).not.toHaveBeenCalled();
    expect(stub.setLogStreaming).not.toHaveBeenCalled();

    stub.getLog.mockResolvedValueOnce(JSON.stringify(['a line']));
    await act(async () => {
      current.setLogStreaming(true);
    });
    expect(stub.setLogStreaming).toHaveBeenLastCalledWith(true);
    expect(current.log).toEqual(['a line']);

    await act(async () => {
      current.setLogStreaming(false);
    });
    expect(stub.setLogStreaming).toHaveBeenLastCalledWith(false);
    expect(current.log).toEqual([]);
  });

  it('turns log streaming off when unmounted while it is on', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const tree = await mount();
    await act(async () => {
      current.setLogStreaming(true);
    });
    await act(async () => {
      tree.unmount();
    });
    expect(stub.setLogStreaming).toHaveBeenLastCalledWith(false);
  });

  it('counts a payment saved after the ledger was read toward the allowance', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const now = Date.now();
    stub.getTransactions.mockResolvedValue(
      JSON.stringify([
        {
          ...pending(1),
          amount: '100.00',
          detectedAtMillis: now,
          synced: true,
          syncedAtMillis: now - 1000,
        },
      ]),
    );
    await mount();
    await act(async () => {
      current.setBudgetInputs({
        transactions: [],
        monthlyBudget: 31000,
        dataAsOfMillis: now - 5000,
      });
    });
    expect(current.allowance?.spentToday).toBe(100);

    await act(async () => {
      current.setBudgetInputs({
        transactions: [],
        monthlyBudget: 31000,
        dataAsOfMillis: now,
      });
    });
    expect(current.allowance?.spentToday).toBe(0);
    stub.getTransactions.mockResolvedValue('[]');
  });

  it('applies onboarding toggles staged before the account exists', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockUser = null;
    const tree = await mount();
    act(() => {
      current.stagePrefs({notesEnabled: false, blockingEnabled: true});
    });
    expect(stub.setPreferences).not.toHaveBeenCalled();

    mockUser = {id: 'user-new'};
    await act(async () => {
      tree.update(
        <AutoTrackProvider>
          <Probe />
        </AutoTrackProvider>,
      );
    });

    expect(current.prefs).toEqual({notesEnabled: false, blockingEnabled: true});
    expect(stub.setPreferences).toHaveBeenCalledWith(
      '{"notesEnabled":false,"blockingEnabled":true}',
    );
  });

  it('applies staged toggles at once when prefs are already loaded', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    expect(current.prefsLoaded).toBe(true);
    act(() => {
      current.stagePrefs({notesEnabled: true, blockingEnabled: false});
    });
    expect(current.prefs).toEqual({notesEnabled: true, blockingEnabled: false});
    expect(stub.setPreferences).toHaveBeenLastCalledWith(
      '{"notesEnabled":true,"blockingEnabled":false}',
    );
  });
});
