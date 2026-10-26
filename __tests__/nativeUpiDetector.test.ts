import {NativeModules, Platform} from 'react-native';

import * as detector from '../src/lib/autotrack/nativeUpiDetector';

type Stub = Record<string, jest.Mock>;
const stub = NativeModules.UpiDetector as unknown as Stub;

function asPlatform(os: 'android' | 'ios') {
  jest.replaceProperty(Platform, 'OS', os);
}

describe('nativeUpiDetector', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
    for (const fn of Object.values(stub)) {
      fn.mockClear();
    }
  });

  describe('when unsupported', () => {
    it('is unsupported off Android even though the module exists', () => {
      asPlatform('ios');
      expect(detector.isAutoTrackSupported()).toBe(false);
    });

    it('resolves empty values and never reaches native', async () => {
      asPlatform('ios');
      expect(await detector.getStatus()).toEqual({
        accessibilityEnabled: false,
        notificationAccessEnabled: false,
        installedApps: [],
      });
      expect(await detector.getTransactions()).toEqual([]);
      expect(await detector.getLog()).toEqual([]);
      expect(await detector.getPending()).toEqual([]);
      expect(await detector.getAllowance()).toBeNull();
      expect(await detector.buildReport()).toBe('');
      expect(await detector.ackSynced([{id: 1, remoteId: 'r'}])).toBe(false);
      await detector.setPreferences({notesEnabled: false, blockingEnabled: true});
      await detector.clearUserData(true);
      await detector.setLogStreaming(true);
      expect(await detector.setOwner('u')).toBe(false);
      expect(stub.getStatus).not.toHaveBeenCalled();
      expect(stub.setOwner).not.toHaveBeenCalled();
      expect(stub.setLogStreaming).not.toHaveBeenCalled();
      expect(stub.setPreferences).not.toHaveBeenCalled();
      expect(stub.clearUserData).not.toHaveBeenCalled();
    });

    it('subscribing is a harmless no-op', () => {
      asPlatform('ios');
      const off = detector.subscribeToDetector(() => {});
      expect(() => off()).not.toThrow();
    });
  });

  describe('on Android', () => {
    beforeEach(() => asPlatform('android'));

    it('is supported when the module is present', () => {
      expect(detector.isAutoTrackSupported()).toBe(true);
    });

    it('parses status and fills missing fields', async () => {
      stub.getStatus.mockResolvedValueOnce(
        JSON.stringify({accessibilityEnabled: true, installedApps: ['a.b']}),
      );
      expect(await detector.getStatus()).toEqual({
        accessibilityEnabled: true,
        notificationAccessEnabled: false,
        installedApps: ['a.b'],
      });
    });

    it('parses transactions, pending items and the log', async () => {
      stub.getTransactions.mockResolvedValueOnce(JSON.stringify([{id: 1}]));
      stub.getPending.mockResolvedValueOnce(
        JSON.stringify([{id: 2, externalRef: 'upi:x:2'}]),
      );
      stub.getLog.mockResolvedValueOnce(JSON.stringify(['one', 'two']));
      expect(await detector.getTransactions()).toEqual([{id: 1}]);
      expect(await detector.getPending()).toEqual([
        {id: 2, externalRef: 'upi:x:2'},
      ]);
      expect(await detector.getLog()).toEqual(['one', 'two']);
    });

    it('treats null, malformed or wrong-shaped JSON as empty', async () => {
      stub.getTransactions.mockResolvedValueOnce(null);
      expect(await detector.getTransactions()).toEqual([]);
      stub.getTransactions.mockResolvedValueOnce('{oops');
      expect(await detector.getTransactions()).toEqual([]);
      stub.getPending.mockResolvedValueOnce(JSON.stringify({not: 'a list'}));
      expect(await detector.getPending()).toEqual([]);
      stub.getAllowance.mockResolvedValueOnce('null');
      expect(await detector.getAllowance()).toBeNull();
    });

    it('returns the native allowance when there is one', async () => {
      stub.getAllowance.mockResolvedValueOnce(
        JSON.stringify({dailyLimit: 500, date: '2026-10-27'}),
      );
      expect(await detector.getAllowance()).toEqual({
        dailyLimit: 500,
        date: '2026-10-27',
      });
    });

    it('swallows native failures into empty values', async () => {
      stub.getTransactions.mockRejectedValueOnce(new Error('boom'));
      stub.getStatus.mockRejectedValueOnce(new Error('boom'));
      stub.keep.mockRejectedValueOnce(new Error('boom'));
      expect(await detector.getTransactions()).toEqual([]);
      expect((await detector.getStatus()).accessibilityEnabled).toBe(false);
      await expect(detector.keep(3)).resolves.toBeUndefined();
    });

    it('sends objects across the bridge as JSON strings', async () => {
      await detector.setPreferences({notesEnabled: false, blockingEnabled: true});
      expect(stub.setPreferences).toHaveBeenCalledWith(
        '{"notesEnabled":false,"blockingEnabled":true}',
      );

      const snapshot = {
        monthKey: '2026-10',
        monthlyBudget: 1000,
        spendByDate: {'2026-10-01': 5},
        dataAsOfMillis: 42,
      };
      await detector.setBudgetSnapshot(snapshot);
      expect(stub.setBudgetSnapshot).toHaveBeenCalledWith(
        JSON.stringify(snapshot),
      );

      expect(await detector.ackSynced([{id: 4, remoteId: null}])).toBe(true);
      expect(stub.ackSynced).toHaveBeenCalledWith('[{"id":4,"remoteId":null}]');
    });

    it('sets the owner, with null on sign-out', async () => {
      expect(await detector.setOwner('user-1')).toBe(true);
      expect(await detector.setOwner(null)).toBe(true);
      expect(stub.setOwner.mock.calls).toEqual([['user-1'], [null]]);
    });

    it('reports a failed setOwner so callers do not read detections', async () => {
      stub.setOwner.mockRejectedValueOnce(new Error('boom'));
      expect(await detector.setOwner('user-1')).toBe(false);
    });

    it('passes purgeHistory to clearUserData (default false)', async () => {
      await detector.clearUserData();
      await detector.clearUserData(true);
      expect(stub.clearUserData.mock.calls).toEqual([[false], [true]]);
    });

    it('toggles log streaming', async () => {
      await detector.setLogStreaming(true);
      await detector.setLogStreaming(false);
      expect(stub.setLogStreaming.mock.calls).toEqual([[true], [false]]);
    });

    it('does not call native to ack an empty list', async () => {
      expect(await detector.ackSynced([])).toBe(true);
      expect(stub.ackSynced).not.toHaveBeenCalled();
    });

    it('reports a failed ack as false', async () => {
      stub.ackSynced.mockRejectedValueOnce(new Error('boom'));
      expect(await detector.ackSynced([{id: 1, remoteId: 'r'}])).toBe(false);
    });

    it('passes ids through and returns the report text untouched', async () => {
      await detector.keep(7);
      await detector.merge(8);
      expect(stub.keep).toHaveBeenCalledWith(7);
      expect(stub.merge).toHaveBeenCalledWith(8);
      stub.buildReport.mockResolvedValueOnce('line 1\nline 2');
      expect(await detector.buildReport()).toBe('line 1\nline 2');
    });

    it('reads preferences with defaults for missing fields', async () => {
      stub.getPreferences.mockResolvedValueOnce(
        JSON.stringify({blockingEnabled: false}),
      );
      expect(await detector.getPreferences()).toEqual({
        notesEnabled: true,
        blockingEnabled: false,
      });
    });

    it('subscribes to detector events and can unsubscribe', () => {
      const callback = jest.fn();
      const off = detector.subscribeToDetector(callback);
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    });
  });
});
