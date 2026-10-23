import {openingBalanceDate} from '../src/lib/transactionsStore';

describe('openingBalanceDate', () => {
  it('is today when there are no transactions', () => {
    expect(openingBalanceDate([], '2026-09-15')).toBe('2026-09-15');
  });

  it('is the earliest transaction date when backdated entries exist', () => {
    expect(
      openingBalanceDate(['2026-09-10', '2026-08-03', '2026-09-01'], '2026-09-15'),
    ).toBe('2026-08-03');
  });

  it('is today when every transaction is future-dated', () => {
    expect(openingBalanceDate(['2026-10-01', '2026-11-05'], '2026-09-15')).toBe(
      '2026-09-15',
    );
  });

  it('normalizes timestamps to calendar dates', () => {
    expect(openingBalanceDate(['2026-08-03T10:00:00.000Z'], '2026-09-15')).toBe(
      '2026-08-03',
    );
  });
});
