import {PendingTxn} from '../src/lib/autotrack/types';
import {supabase} from '../src/lib/supabase/client';
import {
  DETECTED_NOTE_LIMIT,
  upsertDetectedTransaction,
} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({
  supabase: {from: jest.fn(), auth: {getUser: jest.fn()}},
}));

type Call = {method: string; args: unknown[]};

/** A chainable stand-in for a PostgREST builder; awaiting it yields `result`. */
function builder(result: {data?: unknown; error?: unknown}) {
  const calls: Call[] = [];
  const settled = {data: null, error: null, ...result};
  const proxy: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(settled),
  };
  for (const method of [
    'upsert',
    'update',
    'select',
    'eq',
    'is',
    'maybeSingle',
  ]) {
    proxy[method] = (...args: unknown[]) => {
      calls.push({method, args});
      return method === 'maybeSingle' ? Promise.resolve(settled) : proxy;
    };
  }
  return {proxy, calls};
}

function mockFrom(...builders: ReturnType<typeof builder>[]) {
  const from = supabase.from as unknown as jest.Mock;
  from.mockReset();
  for (const item of builders) {
    from.mockReturnValueOnce(item.proxy);
  }
  return from;
}

function pending(partial: Partial<PendingTxn> = {}): PendingTxn {
  return {
    id: 5,
    sourceApp: 'com.phonepe.app',
    amount: '149.50',
    status: 'SUCCESS',
    direction: 'DEBIT',
    merchant: 'Chai Point',
    upiRef: '123456789012',
    detectedAtMillis: new Date(2026, 9, 27, 23, 30).getTime(),
    updatedAtMillis: 0,
    flag: null,
    flagReason: null,
    possibleDuplicateOfId: null,
    note: null,
    synced: false,
    dirty: true,
    remoteId: null,
    syncedAtMillis: null,
    externalRef: 'upi:install-1:5',
    alreadySynced: false,
    ...partial,
  };
}

const firstArg = (calls: Call[], method: string) =>
  calls.find(call => call.method === method)?.args;

describe('upsertDetectedTransaction', () => {
  it('inserts an expense row and returns its id', async () => {
    const insert = builder({data: [{id: 'remote-1'}]});
    const from = mockFrom(insert);

    const id = await upsertDetectedTransaction(
      pending({note: '  chai with Ravi '}),
      'user-1',
    );

    expect(id).toBe('remote-1');
    expect(from).toHaveBeenCalledWith('transactions');
    const [row, options] = firstArg(insert.calls, 'upsert') as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(options).toEqual({
      onConflict: 'user_id,external_ref',
      ignoreDuplicates: true,
    });
    expect(row).toEqual({
      user_id: 'user-1',
      type: 'expense',
      amount: 149.5,
      category_id: null,
      description: 'Chai Point',
      merchant: 'Chai Point',
      transaction_date: '2026-10-27',
      payment_method: 'PhonePe',
      notes: 'chai with Ravi',
      kind: 'regular',
      is_recurring: false,
      source: 'upi_auto',
      external_ref: 'upi:install-1:5',
      upi_ref: '123456789012',
    });
    expect(firstArg(insert.calls, 'select')).toEqual(['id']);
  });

  it('maps a credit to income', async () => {
    const insert = builder({data: [{id: 'r'}]});
    mockFrom(insert);
    await upsertDetectedTransaction(pending({direction: 'CREDIT'}), 'u');
    const [row] = firstArg(insert.calls, 'upsert') as [Record<string, unknown>];
    expect(row.type).toBe('income');
  });

  it('never uploads a payment of unknown direction', async () => {
    const from = mockFrom();
    expect(
      await upsertDetectedTransaction(pending({direction: 'UNKNOWN'}), 'u'),
    ).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to the app name, then a generic label, for the merchant', async () => {
    const gpay = builder({data: [{id: 'r'}]});
    const other = builder({data: [{id: 'r'}]});
    mockFrom(gpay, other);
    await upsertDetectedTransaction(
      pending({
        merchant: '   ',
        sourceApp: 'com.google.android.apps.nbu.paisa.user',
      }),
      'u',
    );
    await upsertDetectedTransaction(
      pending({merchant: null, sourceApp: 'com.unknown.app'}),
      'u',
    );
    const [gpayRow] = firstArg(gpay.calls, 'upsert') as [
      Record<string, unknown>,
    ];
    const [otherRow] = firstArg(other.calls, 'upsert') as [
      Record<string, unknown>,
    ];
    expect(gpayRow).toMatchObject({
      merchant: 'Google Pay',
      description: 'Google Pay',
      payment_method: 'Google Pay',
    });
    expect(otherRow).toMatchObject({
      merchant: 'UPI payment',
      description: 'UPI payment',
      payment_method: 'UPI',
    });
  });

  it('truncates long notes and stores blank ones as null', async () => {
    const long = builder({data: [{id: 'r'}]});
    const blank = builder({data: [{id: 'r'}]});
    mockFrom(long, blank);
    await upsertDetectedTransaction(pending({note: 'x'.repeat(250)}), 'u');
    await upsertDetectedTransaction(pending({note: '   '}), 'u');
    const [longRow] = firstArg(long.calls, 'upsert') as [
      Record<string, unknown>,
    ];
    const [blankRow] = firstArg(blank.calls, 'upsert') as [
      Record<string, unknown>,
    ];
    expect((longRow.notes as string).length).toBe(DETECTED_NOTE_LIMIT);
    expect(blankRow.notes).toBeNull();
  });

  it('looks up the existing row when the insert was ignored', async () => {
    const insert = builder({data: []});
    const lookup = builder({data: {id: 'existing'}});
    mockFrom(insert, lookup);
    expect(await upsertDetectedTransaction(pending(), 'user-1')).toBe(
      'existing',
    );
    expect(lookup.calls).toEqual([
      {method: 'select', args: ['id']},
      {method: 'eq', args: ['user_id', 'user-1']},
      {method: 'eq', args: ['external_ref', 'upi:install-1:5']},
      {method: 'maybeSingle', args: []},
    ]);
  });

  it('adds the note on the lookup path when a lost ack left the row note-less', async () => {
    const insert = builder({data: []});
    const lookup = builder({data: {id: 'existing'}});
    const update = builder({});
    mockFrom(insert, lookup, update);
    expect(
      await upsertDetectedTransaction(pending({note: ' hello '}), 'user-1'),
    ).toBe('existing');
    expect(update.calls).toEqual([
      {method: 'update', args: [{notes: 'hello'}]},
      {method: 'eq', args: ['user_id', 'user-1']},
      {method: 'eq', args: ['external_ref', 'upi:install-1:5']},
      {method: 'is', args: ['notes', null]},
    ]);
  });

  it('skips the note update on the lookup path when there is no note', async () => {
    const from = mockFrom(builder({data: []}), builder({data: {id: 'e'}}));
    await upsertDetectedTransaction(pending({note: null}), 'u');
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('resolves null when the insert was ignored and the row is gone', async () => {
    mockFrom(builder({data: []}), builder({data: null}));
    expect(await upsertDetectedTransaction(pending(), 'u')).toBeNull();
  });

  it('skips unusable amounts without calling Supabase', async () => {
    const from = mockFrom();
    expect(
      await upsertDetectedTransaction(pending({amount: '0.00'}), 'u'),
    ).toBeNull();
    expect(
      await upsertDetectedTransaction(pending({amount: 'abc'}), 'u'),
    ).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('throws on a Supabase error so the detection is retried', async () => {
    mockFrom(builder({error: {message: 'network down'}}));
    await expect(upsertDetectedTransaction(pending(), 'u')).rejects.toThrow();
  });

  describe('a note added after the first sync', () => {
    it('only fills in a missing note on the existing row', async () => {
      const update = builder({});
      const from = mockFrom(update);
      const id = await upsertDetectedTransaction(
        pending({alreadySynced: true, remoteId: 'remote-9', note: ' later '}),
        'user-1',
      );
      expect(id).toBe('remote-9');
      expect(from).toHaveBeenCalledTimes(1);
      expect(update.calls).toEqual([
        {method: 'update', args: [{notes: 'later'}]},
        {method: 'eq', args: ['user_id', 'user-1']},
        {method: 'eq', args: ['external_ref', 'upi:install-1:5']},
        {method: 'is', args: ['notes', null]},
      ]);
    });

    it('does not touch Supabase when there is no note to add', async () => {
      const from = mockFrom();
      expect(
        await upsertDetectedTransaction(
          pending({alreadySynced: true, remoteId: 'remote-9', note: null}),
          'u',
        ),
      ).toBe('remote-9');
      expect(from).not.toHaveBeenCalled();
    });

    it('throws when the update fails', async () => {
      mockFrom(builder({error: {message: 'nope'}}));
      await expect(
        upsertDetectedTransaction(
          pending({alreadySynced: true, remoteId: 'r', note: 'hi'}),
          'u',
        ),
      ).rejects.toThrow();
    });
  });
});
