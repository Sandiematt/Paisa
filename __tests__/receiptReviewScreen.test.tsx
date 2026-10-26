import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {PrimaryButton, SecondaryButton} from '../src/components/ui';
import {ReceiptReviewScreen} from '../src/features/receipts/ReceiptReviewScreen';
import {receiptFingerprint} from '../src/lib/receipts/receiptDuplicates';
import {TransactionRow} from '../src/lib/transactionsStore';

jest.mock('../src/theme/useAppFonts', () => ({
  useAppFonts: () => [true, null],
}));

// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock(
  'phosphor-react-native',
  () =>
    new Proxy(
      {},
      {get: (_target, name) => (name === '__esModule' ? false : () => null)},
    ),
);

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

const mockRecognize = jest.fn();
jest.mock('../src/lib/receipts/scanReceipt', () => ({
  recognizeReceiptText: (...args: unknown[]) => mockRecognize(...args),
}));

jest.mock('../src/lib/categoriesStore', () => {
  const actual = jest.requireActual('../src/lib/categoriesStore');
  return {
    ...actual,
    loadCategories: async () => [
      {
        id: 'cat-groceries',
        userId: null,
        name: 'Groceries',
        icon: 'cart',
        color: '#12998B',
        type: 'expense',
        slug: 'groceries',
      },
    ],
    findOrCreateUserCategory: jest.fn(),
  };
});

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../src/lib/transactionsStore', () => {
  const actual = jest.requireActual('../src/lib/transactionsStore');
  return {
    ...actual,
    createTransaction: (...args: unknown[]) => mockCreate(...args),
    updateTransaction: (...args: unknown[]) => mockUpdate(...args),
  };
});

const LINES = [
  'DMART AVENUE SUPERMARTS',
  'Date: 24/10/2026',
  'Amul Milk 500ml  2  30.00  60.00',
  'Brown Bread  1  45.00  45.00',
  'Grand Total  105.00',
  'Paid by UPI  105.00',
];

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (
    node:
      | ReactTestRenderer.ReactTestRendererNode
      | null
      | ReactTestRenderer.ReactTestRendererNode[],
  ) => {
    if (node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    const label = node.props?.accessibilityLabel;
    if (typeof label === 'string') parts.push(label);
    walk(node.children as ReactTestRenderer.ReactTestRendererNode[] | null);
  };
  walk(tree.toJSON());
  return parts.join(' | ');
}

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'saved',
    userId: 'u1',
    type: 'expense',
    amount: 105,
    categoryId: null,
    description: 'Dmart Avenue Supermarts',
    merchant: 'Dmart Avenue Supermarts',
    transactionDate: '2026-10-24',
    paymentMethod: 'UPI',
    notes: null,
    kind: 'regular',
    isRecurring: false,
    source: 'receipt_scan',
    externalRef: null,
    upiRef: null,
    createdAt: '2026-10-24T13:00:00Z',
    updatedAt: '2026-10-24T13:00:00Z',
    ...overrides,
  };
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  // Let OCR and the category load settle.
  await act(async () => {});
  mounted.push(tree);
  return tree;
}

function saveButton(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findByType(PrimaryButton);
}

beforeEach(() => {
  mockRecognize.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

const IMAGE = {uri: 'file://receipt.jpg', width: 3000};

describe('ReceiptReviewScreen', () => {
  it('shows what was read and saves it on confirm', async () => {
    mockRecognize.mockResolvedValue(LINES);
    const saved = row({});
    mockCreate.mockResolvedValue(saved);
    const onSaved = jest.fn();

    const tree = await render(
      <ReceiptReviewScreen
        image={IMAGE}
        currencySymbol="₹"
        transactions={[]}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    expect(mockRecognize).toHaveBeenCalledWith('file://receipt.jpg', 3000);
    const text = textOf(tree);
    expect(text).toContain('Dmart Avenue Supermarts');
    expect(text).toContain('24 Oct 2026');
    expect(text).toContain('Amul Milk 500ml');
    expect(text).toContain(
      'Items, tax and charges add up to the printed total',
    );
    expect(saveButton(tree).props.label).toBe('Save expense · ₹105');

    await act(async () => {
      await saveButton(tree).props.onPress();
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amount: 105,
        merchant: 'Dmart Avenue Supermarts',
        transactionDate: '2026-10-24',
        categoryId: 'cat-groceries',
        paymentMethod: 'UPI',
        source: 'receipt_scan',
        externalRef: 'receipt:2026-10-24:expense:10500:dmartavenuesupermarts',
        notes: 'Amul Milk 500ml, Brown Bread',
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved, false);
  });

  it('blocks saving the same receipt twice until the user asks for a copy', async () => {
    mockRecognize.mockResolvedValue(LINES);
    mockCreate.mockResolvedValue(row({id: 'copy'}));
    const ref = receiptFingerprint({
      type: 'expense',
      amountCents: 10500,
      date: '2026-10-24',
      merchant: 'Dmart Avenue Supermarts',
    });

    const tree = await render(
      <ReceiptReviewScreen
        image={IMAGE}
        currencySymbol="₹"
        transactions={[row({externalRef: ref})]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(textOf(tree)).toContain('You already saved this receipt');
    expect(saveButton(tree).props.disabled).toBe(true);

    const copy = tree.root
      .findAllByType(SecondaryButton)
      .find(button => button.props.label === 'Save another copy')!;
    await act(async () => copy.props.onPress());
    expect(saveButton(tree).props.disabled).toBe(false);

    await act(async () => {
      await saveButton(tree).props.onPress();
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.externalRef).toMatch(new RegExp(`^${ref}:\\d+$`));
  });

  it('folds the receipt into a matching auto-tracked UPI payment', async () => {
    mockRecognize.mockResolvedValue(LINES);
    const upi = row({
      id: 'upi',
      merchant: 'PhonePe',
      description: 'PhonePe',
      source: 'upi_auto',
    });
    mockUpdate.mockResolvedValue({
      ...upi,
      merchant: 'Dmart Avenue Supermarts',
    });
    const onSaved = jest.fn();

    const tree = await render(
      <ReceiptReviewScreen
        image={IMAGE}
        currencySymbol="₹"
        transactions={[upi]}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    expect(textOf(tree)).toContain('Auto-tracking may have saved this payment');
    const merge = tree.root
      .findAllByType(SecondaryButton)
      .find(button => button.props.label === 'Add details to it')!;
    await act(async () => {
      await merge.props.onPress();
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('upi', {
      merchant: 'Dmart Avenue Supermarts',
      description: 'Dmart Avenue Supermarts',
      categoryId: 'cat-groceries',
      notes: 'Amul Milk 500ml, Brown Bread',
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({id: 'upi'}),
      true,
    );
  });

  it('reports a database duplicate instead of saving twice', async () => {
    mockRecognize.mockResolvedValue(LINES);
    mockCreate.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "transactions_user_external_ref_key"',
      ),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();

    const tree = await render(
      <ReceiptReviewScreen
        image={IMAGE}
        currencySymbol="₹"
        transactions={[]}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    await act(async () => {
      await saveButton(tree).props.onPress();
    });

    expect(alert).toHaveBeenCalledWith('Already saved', expect.any(String));
    expect(onSaved).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('offers a retry when OCR fails', async () => {
    mockRecognize.mockRejectedValueOnce(
      new Error('Could not reach the server. Check your connection.'),
    );
    mockRecognize.mockResolvedValueOnce(LINES);

    const tree = await render(
      <ReceiptReviewScreen
        image={IMAGE}
        currencySymbol="₹"
        transactions={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(textOf(tree)).toContain('Could not reach the server');
    await act(async () => {
      tree.root.findByType(PrimaryButton).props.onPress();
    });
    await act(async () => {});
    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(textOf(tree)).toContain('Amul Milk 500ml');
  });
});
