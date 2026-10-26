import {supabase} from '../src/lib/supabase/client';
import {loadTransactions} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({
  supabase: {from: jest.fn()},
}));

function row(index: number) {
  return {
    id: `id-${index}`,
    user_id: 'u',
    type: 'expense',
    amount: '10.00',
    category_id: null,
    description: null,
    merchant: null,
    transaction_date: '2026-01-01',
    payment_method: null,
    notes: null,
    kind: 'regular',
    is_recurring: false,
    source: 'manual',
    external_ref: null,
    upi_ref: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** A PostgREST stand-in that serves `total` rows through .range(). */
function pagedTable(total: number) {
  const ranges: [number, number][] = [];
  const all = Array.from({length: total}, (_, index) => row(index));
  (supabase.from as unknown as jest.Mock).mockImplementation(() => {
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.order = () => query;
    query.range = (from: number, to: number) => {
      ranges.push([from, to]);
      return Promise.resolve({data: all.slice(from, to + 1), error: null});
    };
    return query;
  });
  return ranges;
}

describe('loadTransactions', () => {
  it('pages past the API row cap so the newest rows are kept', async () => {
    const ranges = pagedTable(2500);
    const rows = await loadTransactions();
    expect(rows).toHaveLength(2500);
    expect(rows[2499].id).toBe('id-2499');
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after one request when everything fits in a page', async () => {
    const ranges = pagedTable(3);
    expect(await loadTransactions()).toHaveLength(3);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('asks once more when the last page is exactly full', async () => {
    const ranges = pagedTable(1000);
    expect(await loadTransactions()).toHaveLength(1000);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
