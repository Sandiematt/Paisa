import {checkReceipt, parseReceipt} from '../src/lib/receipts/parseReceipt';
import {cleanLine, findDate, findMoney} from '../src/lib/receipts/receiptText';

const TODAY = '2026-10-26';

function parse(text: string, dayFirst = true) {
  return parseReceipt(text.split('\n'), {today: TODAY, dayFirst});
}

const GROCERY = `
DMART AVENUE SUPERMARTS
Plot 12, Hosur Road, Bengaluru 560068
GSTIN: 29AACCA8432H1ZQ
TAX INVOICE
Bill No: 4512   Date: 24/10/2026 18:42
Item            Qty   Rate    Amount
Amul Milk 500ml  2   30.00    60.00
Brown Bread      1   45.00    45.00
Eggs 12 pcs      1   84.00    84.00
Basmati Rice 5kg 1  499.00   499.00
Total Items: 5
Sub Total               688.00
CGST @ 2.5%              17.20
SGST @ 2.5%              17.20
Round Off                -0.40
Grand Total             722.00
Paid by UPI             722.00
Thank you for shopping with us
`;

const RESTAURANT = `
The Daily Grind Cafe
12th Main, Indiranagar
Ph: 080-41234567
Table: 7  Covers: 2
Date: 23 Oct 2026  Time: 09:15 PM
Cappuccino x2           360.00
Masala Omelette         220.00
Cold Coffee             190.00
Service Charge 5%        38.50
CGST 2.5%                20.21
SGST 2.5%                20.21
Net Payable             849.00
Card ****4821
`;

const REFUND = `
LIFESTYLE STORES
CREDIT NOTE
Date 20-10-2026
Returned items
Denim Jacket   1   2,499.00   -2,499.00
Refund Amount             2,499.00
Refunded to original card
`;

const EXCHANGE = `
DECATHLON SPORTS INDIA
Date: 2026-10-22
Running Shoes            3,999.00
Return: Cycling Gloves     -799.00
Total                    3,200.00
`;

describe('cleanLine', () => {
  it('fixes O for 0 and split decimals', () => {
    expect(cleanLine('Total   4O5 .5O')).toBe('Total 405.50');
    expect(cleanLine('Tea 2O. 00')).toBe('Tea 20.00');
  });
});

describe('findMoney', () => {
  it('reads plain, grouped, currency-marked and credit amounts', () => {
    expect(findMoney('Total ₹1,23,456.50').map(t => t.cents)).toEqual([
      12345650,
    ]);
    expect(findMoney('Rs.418').map(t => t.cents)).toEqual([41800]);
    expect(findMoney('Return -799.00').map(t => t.credit)).toEqual([true]);
    expect(findMoney('Refund 50.00 CR').map(t => t.credit)).toEqual([true]);
    expect(findMoney('Adjustment (12.00)').map(t => t.credit)).toEqual([true]);
  });

  it('skips sizes, percentages, masked card digits, dates and times', () => {
    expect(findMoney('Milk 500ml CGST @ 2.5%')).toEqual([]);
    expect(findMoney('Card ****4821')).toEqual([]);
    expect(findMoney('Date: 24/10/2026 18:42')).toEqual([]);
    expect(findMoney('Barcode 8901234567890')).toEqual([]);
  });

  it('does not read a joining hyphen as a minus sign', () => {
    expect(findMoney('Item-2 40.00').map(t => t.credit)).toEqual([
      false,
      false,
    ]);
  });
});

describe('findDate', () => {
  const options = {dayFirst: true, latest: '2026-10-27'};
  it.each([
    ['Date: 24/10/2026', '2026-10-24'],
    ['24-10-26', '2026-10-24'],
    ['2026-10-24', '2026-10-24'],
    ['24 Oct 2026', '2026-10-24'],
    ['Oct 24, 2026', '2026-10-24'],
    ['24th October, 2026', '2026-10-24'],
    ['03/04/2026', '2026-04-03'],
    ['10/24/2026', '2026-10-24'],
  ])('reads %s', (line, expected) => {
    expect(findDate(line, options)).toBe(expected);
  });

  it('reads month first when asked', () => {
    expect(findDate('03/04/2026', {...options, dayFirst: false})).toBe(
      '2026-03-04',
    );
  });

  it('rejects impossible and future days', () => {
    expect(findDate('31/02/2026', options)).toBeNull();
    expect(findDate('12/12/2027', options)).toBeNull();
  });
});

describe('grocery tax invoice', () => {
  const receipt = parse(GROCERY);

  it('reads merchant, date and total', () => {
    expect(receipt.merchant).toBe('Dmart Avenue Supermarts');
    expect(receipt.date).toBe('2026-10-24');
    expect(receipt.totalCents).toBe(72200);
    expect(receipt.subtotalCents).toBe(68800);
    expect(receipt.amountCents).toBe(72200);
    expect(receipt.paymentMethod).toBe('UPI');
  });

  it('reads line items with quantity and unit price', () => {
    expect(
      receipt.lineItems.map(i => [
        i.description,
        i.quantity,
        i.unitCents,
        i.amountCents,
      ]),
    ).toEqual([
      ['Amul Milk 500ml', 2, 3000, 6000],
      ['Brown Bread', 1, 4500, 4500],
      ['Eggs 12 pcs', 1, 8400, 8400],
      ['Basmati Rice 5kg', 1, 49900, 49900],
    ]);
  });

  it('adds taxes and round-off to the subtotal and matches the total', () => {
    expect(receipt.adjustments.map(a => [a.kind, a.cents])).toEqual([
      ['tax', 1720],
      ['tax', 1720],
      ['rounding', -40],
    ]);
    expect(receipt.check).toEqual({status: 'matched'});
  });

  it('is an expense in groceries', () => {
    expect(receipt.classification.type).toBe('expense');
    expect(receipt.classification.confidence).toBe('high');
    expect(receipt.suggestedCategoryId).toBe('groceries');
  });
});

describe('restaurant bill', () => {
  const receipt = parse(RESTAURANT);

  it('reads the header and ignores table, covers and phone numbers', () => {
    expect(receipt.merchant).toBe('The Daily Grind Cafe');
    expect(receipt.date).toBe('2026-10-23');
    expect(receipt.lineItems).toHaveLength(3);
    expect(receipt.lineItems[0]).toMatchObject({
      description: 'Cappuccino',
      amountCents: 36000,
    });
  });

  it('takes the net payable as the total and checks it', () => {
    expect(receipt.totalCents).toBe(84900);
    // 770 + 38.50 + 40.42 = 848.92, printed as 849.
    expect(receipt.check).toEqual({status: 'matched'});
    expect(receipt.paymentMethod).toBe('Card');
    expect(receipt.suggestedCategoryId).toBe('dining');
    expect(receipt.classification.type).toBe('expense');
  });
});

describe('refund credit note', () => {
  const receipt = parse(REFUND);

  it('is income with the refunded amount', () => {
    expect(receipt.merchant).toBe('Lifestyle Stores');
    expect(receipt.date).toBe('2026-10-20');
    expect(receipt.amountCents).toBe(249900);
    expect(receipt.lineItems).toEqual([
      expect.objectContaining({flow: 'credit', amountCents: 249900}),
    ]);
    expect(receipt.classification.type).toBe('income');
    expect(receipt.classification.confidence).toBe('high');
    expect(receipt.suggestedCategoryId).toBe('refund');
    expect(receipt.check).toEqual({status: 'matched'});
  });
});

describe('exchange with a return', () => {
  it('nets returns against purchases and stays an expense', () => {
    const receipt = parse(EXCHANGE);
    expect(receipt.lineItems.map(i => [i.flow, i.amountCents])).toEqual([
      ['debit', 399900],
      ['credit', 79900],
    ]);
    expect(receipt.amountCents).toBe(320000);
    expect(receipt.check).toEqual({status: 'matched'});
    expect(receipt.classification.type).toBe('expense');
  });

  it('turns into income when returns outweigh purchases', () => {
    const receipt = parse(`
SHOPPERS STOP
Socks                 299.00
Return: Blazer     -4,999.00
Total              -4,700.00
`);
    expect(receipt.amountCents).toBe(470000);
    expect(receipt.classification.type).toBe('income');
  });
});

describe('partial receipts', () => {
  it('adds up the items when no total is printed', () => {
    const receipt = parse(`
Sharma Tea Stall
Tea 2 20
Samosa 3 45
`);
    expect(receipt.totalCents).toBeNull();
    expect(receipt.amountCents).toBe(6500);
    expect(receipt.check).toEqual({status: 'computed'});
    expect(receipt.lineItems.map(i => i.quantity)).toEqual([2, 3]);
  });

  it('reads a total printed on the line below its label', () => {
    const receipt = parse(`
QuickFuel Station
Petrol 4.21 L x 103.94
TOTAL
437.59
`);
    expect(receipt.totalCents).toBe(43759);
    expect(receipt.suggestedCategoryId).toBe('transport');
  });

  it('flags a total that does not match the items', () => {
    const receipt = parse(`
Corner Store
Chips      50.00
Juice      80.00
Total     150.00
`);
    expect(receipt.check).toEqual({
      status: 'mismatch',
      differenceCents: 2000,
    });
    expect(receipt.amountCents).toBe(15000);
  });

  it('treats a GST breakup of inclusive prices as already in the total', () => {
    const receipt = parse(`
Croma Electronics
Earphones            1,180.00
CGST 9%                 90.00
SGST 9%                 90.00
Total                1,180.00
`);
    expect(receipt.check).toEqual({status: 'matched'});
    expect(receipt.suggestedCategoryId).toBe('shopping');
  });

  it('returns nothing confident for unreadable text', () => {
    const receipt = parse('~~~\n###');
    expect(receipt.amountCents).toBeNull();
    expect(receipt.check).toEqual({status: 'none'});
    expect(receipt.classification.confidence).toBe('low');
  });
});

describe('checkReceipt', () => {
  it('reports the difference when the numbers disagree', () => {
    expect(
      checkReceipt({
        totalCents: 10000,
        subtotalCents: 9000,
        items: [],
        adjustments: [{label: 'Tax', kind: 'tax', cents: 500}],
      }),
    ).toEqual({
      check: {status: 'mismatch', differenceCents: 500},
      computedCents: 9500,
      extrasCents: 500,
    });
  });

  it('reports no extras when the taxes were already in the prices', () => {
    expect(
      checkReceipt({
        totalCents: 118000,
        subtotalCents: null,
        items: [
          {
            id: 'a',
            description: 'Earphones',
            quantity: null,
            unitCents: null,
            amountCents: 118000,
            flow: 'debit',
          },
        ],
        adjustments: [{label: 'GST', kind: 'tax', cents: 18000}],
      }),
    ).toEqual({
      check: {status: 'matched'},
      computedCents: 118000,
      extrasCents: 0,
    });
  });

  it('hands tax back on a return', () => {
    expect(
      checkReceipt({
        totalCents: -11000,
        subtotalCents: null,
        items: [
          {
            id: 'a',
            description: 'Return: Mug',
            quantity: null,
            unitCents: null,
            amountCents: 10000,
            flow: 'credit',
          },
        ],
        adjustments: [{label: 'GST', kind: 'tax', cents: 1000}],
      }),
    ).toEqual({
      check: {status: 'matched'},
      computedCents: -11000,
      extrasCents: -1000,
    });
  });
});

describe('awkward layouts', () => {
  it('joins an item name with the numbers OCR put on the next line', () => {
    const receipt = parse(`
Fresh Basket
Description        Qty   Rate   Amount
Organic Alphonso Mangoes 1kg
                    2   350.00  700.00
Total                          700.00
`);
    expect(receipt.lineItems).toEqual([
      expect.objectContaining({
        description: 'Organic Alphonso Mangoes 1kg',
        quantity: 2,
        amountCents: 70000,
      }),
    ]);
    expect(receipt.check).toEqual({status: 'matched'});
  });

  it('works out the amount for "qty x price" with no line amount', () => {
    const receipt = parse(`
Chai Point
Masala Chai 3 x 40.00
Total 120.00
`);
    expect(receipt.lineItems[0]).toMatchObject({
      quantity: 3,
      unitCents: 4000,
      amountCents: 12000,
    });
    expect(receipt.check).toEqual({status: 'matched'});
  });

  it('drops a "Total GST" line when CGST and SGST are itemised', () => {
    const receipt = parse(`
Biryani House
Chicken Biryani     300.00
CGST 2.5%             7.50
SGST 2.5%             7.50
Total GST            15.00
Grand Total         315.00
`);
    expect(receipt.adjustments.map(a => a.label)).toEqual([
      'CGST 2.5%',
      'SGST 2.5%',
    ]);
    expect(receipt.check).toEqual({status: 'matched'});
  });

  it('falls back to the amount paid when no total is labelled', () => {
    const receipt = parse(`
Metro Parking
Parking 2 hrs
Amount Paid   60.00
`);
    expect(receipt.totalCents).toBe(6000);
    expect(receipt.suggestedCategoryId).toBe('transport');
  });

  it('turns an item-level discount into a credit line', () => {
    const receipt = parse(`
Westside
Linen Shirt        1,999.00
Discount 20%        -400.00
Total              1,599.00
`);
    expect(receipt.lineItems.map(i => [i.flow, i.amountCents])).toEqual([
      ['debit', 199900],
      ['credit', 40000],
    ]);
    expect(receipt.check).toEqual({status: 'matched'});
    expect(receipt.suggestedCategoryId).toBe('shopping');
  });

  it('reads a US receipt month first', () => {
    const receipt = parse(
      `
Trader Joe's
03/04/2026 14:02
Bananas    1.99
TOTAL      1.99
`,
      false,
    );
    expect(receipt.date).toBe('2026-03-04');
  });
});

describe('classification', () => {
  it('reads a payslip as salary income', () => {
    const receipt = parse(`
Yestack Technologies
Payslip for October 2026
Basic Salary        60,000.00
HRA                 20,000.00
Net Pay             80,000.00
`);
    expect(receipt.classification).toMatchObject({
      type: 'income',
      confidence: 'high',
    });
    expect(receipt.suggestedCategoryId).toBe('salary');
  });

  it('defaults to expense with low confidence when nothing points either way', () => {
    const receipt = parse(`
Something
Thing 10.00
`);
    expect(receipt.classification.type).toBe('expense');
    expect(receipt.classification.reasons.length).toBeGreaterThan(0);
  });

  it('explains why a receipt is an expense', () => {
    const receipt = parse(GROCERY);
    expect(receipt.classification.reasons[0]).toBe('4 purchased items');
  });
});
