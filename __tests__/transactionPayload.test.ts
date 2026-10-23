import {buildTransactionPayload} from '../src/features/add/transactionPayload';

const base = {
  amount: '12.50',
  type: 'expense' as const,
  categoryId: 'cat-food',
  categoryName: 'Food',
  transactionDate: '2026-10-01',
  note: '',
};

describe('amount validation', () => {
  it.each([
    ['12.50', 12.5],
    ['1,234.5', 1234.5],
    ['7', 7],
    ['0.01', 0.01],
  ])('accepts %s', (amount, expected) => {
    const result = buildTransactionPayload({...base, amount});
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({payload: {amount: expected}});
  });

  it.each(['', '0', '0.00', '.', 'abc', '1.234', '1.2.3', '12abc', '-5'])(
    'rejects %p',
    amount => {
      const result = buildTransactionPayload({...base, amount});
      expect(result.ok).toBe(false);
    },
  );
});

describe('create', () => {
  it('saves kind regular with the category name as merchant and description', () => {
    const result = buildTransactionPayload({...base, note: '  lunch '});
    expect(result).toEqual({
      ok: true,
      mode: 'create',
      payload: {
        kind: 'regular',
        type: 'expense',
        amount: 12.5,
        categoryId: 'cat-food',
        description: 'Food',
        merchant: 'Food',
        transactionDate: '2026-10-01',
        notes: 'lunch',
      },
    });
  });
});

describe('edit', () => {
  const existing: {
    merchant: string | null;
    description: string | null;
    paymentMethod: string | null;
    isRecurring: boolean;
  } = {
    merchant: 'Food',
    description: 'Food',
    paymentMethod: 'upi',
    isRecurring: true,
  };
  const edit = (
    over: Partial<typeof existing>,
    extra: {oldCategoryName?: string | null} = {},
  ) =>
    buildTransactionPayload({
      ...base,
      categoryId: 'cat-transport',
      categoryName: 'Transport',
      existing: {...existing, ...over},
      oldCategoryName: 'Food',
      ...extra,
    });

  it('moves a default name and description to the new category', () => {
    const result = edit({});
    expect(result).toMatchObject({
      ok: true,
      mode: 'update',
      patch: {merchant: 'Transport', description: 'Transport'},
    });
  });

  it('treats empty merchant and description as default', () => {
    expect(edit({merchant: ' ', description: null})).toMatchObject({
      patch: {merchant: 'Transport', description: 'Transport'},
    });
  });

  it('keeps a custom merchant', () => {
    expect(edit({merchant: 'Uber'})).toMatchObject({
      patch: {merchant: 'Uber', description: 'Transport'},
    });
  });

  it('keeps a custom description', () => {
    expect(edit({description: 'Airport run'})).toMatchObject({
      patch: {merchant: 'Transport', description: 'Airport run'},
    });
  });

  it('keeps a custom merchant when the old category is unknown', () => {
    expect(edit({merchant: 'Uber'}, {oldCategoryName: null})).toMatchObject({
      patch: {merchant: 'Uber'},
    });
  });

  it('never sends kind and preserves payment method and recurrence', () => {
    const result = edit({});
    expect(result.ok && result.mode === 'update' && result.patch).not.toHaveProperty(
      'kind',
    );
    expect(result).toMatchObject({
      patch: {paymentMethod: 'upi', isRecurring: true, amount: 12.5},
    });
  });
});
