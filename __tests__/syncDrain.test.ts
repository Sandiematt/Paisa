import {createSyncDrain} from '../src/features/autotrack/syncDrain';
import {PendingTxn} from '../src/lib/autotrack/types';

function pending(id: number): PendingTxn {
  return {
    id,
    sourceApp: 'com.phonepe.app',
    amount: '10.00',
    status: 'SUCCESS',
    direction: 'DEBIT',
    merchant: null,
    upiRef: null,
    detectedAtMillis: 0,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
}

describe('createSyncDrain', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acks only the detections that saved', async () => {
    const ack = jest.fn(async () => true);
    const drain = createSyncDrain({
      enabled: () => true,
      getPending: async () => [pending(1), pending(2), pending(3)],
      save: async item => {
        if (item.id === 2) {
          throw new Error('offline');
        }
        return item.id === 3 ? null : `remote-${item.id}`;
      },
      ack,
    });

    const result = await drain.run();

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith([
      {id: 1, remoteId: 'remote-1'},
      {id: 3, remoteId: null},
    ]);
    expect(result).toEqual({acked: 2, failed: 1, skipped: false});
  });

  it('does not ack when nothing saved', async () => {
    const ack = jest.fn(async () => true);
    const drain = createSyncDrain({
      enabled: () => true,
      getPending: async () => [pending(1)],
      save: async () => {
        throw new Error('offline');
      },
      ack,
    });
    expect(await drain.run()).toEqual({acked: 0, failed: 1, skipped: false});
    expect(ack).not.toHaveBeenCalled();
  });

  it('reports saved rows as failed when native refuses the ack', async () => {
    const drain = createSyncDrain({
      enabled: () => true,
      getPending: async () => [pending(1)],
      save: async () => 'r',
      ack: async () => false,
    });
    expect(await drain.run()).toEqual({acked: 0, failed: 1, skipped: false});
  });

  it('never uploads or acks a payment of unknown direction', async () => {
    const save = jest.fn(async () => 'r');
    const ack = jest.fn(async () => true);
    const drain = createSyncDrain({
      enabled: () => true,
      getPending: async () => [{...pending(1), direction: 'UNKNOWN'}],
      save,
      ack,
    });
    expect(await drain.run()).toEqual({acked: 0, failed: 0, skipped: false});
    expect(save).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('does not ack when the owner changed while saving', async () => {
    let owner = 'a';
    const ack = jest.fn(async () => true);
    const drain = createSyncDrain({
      enabled: () => owner === 'a',
      getPending: async () => [pending(1)],
      save: async () => {
        owner = 'b';
        return 'r';
      },
      ack,
    });
    const result = await drain.run();
    expect(ack).not.toHaveBeenCalled();
    expect(result.acked).toBe(0);
  });

  it('does nothing while disabled (unsupported or signed out)', async () => {
    const getPending = jest.fn(async () => [pending(1)]);
    const drain = createSyncDrain({
      enabled: () => false,
      getPending,
      save: async () => 'r',
      ack: async () => true,
    });
    expect(await drain.run()).toEqual({acked: 0, failed: 0, skipped: true});
    expect(getPending).not.toHaveBeenCalled();
  });

  it('never throws, even when native or the store blows up', async () => {
    const drain = createSyncDrain({
      enabled: () => true,
      getPending: async () => {
        throw new Error('native gone');
      },
      save: async () => 'r',
      ack: async () => true,
    });
    await expect(drain.run()).resolves.toMatchObject({acked: 0, failed: 1});
  });

  it('runs one drain at a time and goes round once more for late triggers', async () => {
    const gate = deferred<PendingTxn[]>();
    let inFlight = 0;
    let maxInFlight = 0;
    const track = async (rows: Promise<PendingTxn[]> | PendingTxn[]) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const result = await rows;
      inFlight -= 1;
      return result;
    };
    const getPending = jest
      .fn<Promise<PendingTxn[]>, []>()
      .mockImplementationOnce(() => track(gate.promise))
      .mockImplementation(() => track([pending(2)]));
    const save = jest.fn(async (item: PendingTxn) => `r${item.id}`);
    const ack = jest.fn(async () => true);
    const running: boolean[] = [];
    const drain = createSyncDrain({
      enabled: () => true,
      getPending,
      save,
      ack,
      onRunningChange: value => running.push(value),
    });

    const first = drain.run();
    const second = drain.run();
    const third = drain.run();
    gate.resolve([pending(1)]);
    const results = await Promise.all([first, second, third]);

    expect(maxInFlight).toBe(1);
    expect(getPending).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map(([item]) => item.id)).toEqual([1, 2]);
    expect(results[0]).toBe(results[1]);
    expect(results[0].acked).toBe(2);
    expect(running).toEqual([true, false]);
  });

  it('can run again after a drain ends', async () => {
    const getPending = jest.fn(async () => [] as PendingTxn[]);
    const drain = createSyncDrain({
      enabled: () => true,
      getPending,
      save: async () => 'r',
      ack: async () => true,
    });
    await drain.run();
    await drain.run();
    expect(getPending).toHaveBeenCalledTimes(2);
  });
});
