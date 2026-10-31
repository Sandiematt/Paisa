import React, {useEffect, useMemo, useState} from 'react';
import {Alert, View} from 'react-native';

import {
  AppText,
  GhostButton,
  PressableScale,
  PrimaryButton,
  TextField,
} from '../../components/ui';
import {CycleBill} from '../../lib/billMonths';
import {CycleRange} from '../../lib/budgetEngine';
import {isDayToDaySpend} from '../../lib/budgetInputs';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow, calendarDateISO} from '../../lib/transactionsStore';
import {colors, makeStyles, radii, spacing} from '../../theme';
import {groupMoneyInput, sanitizeMoneyInput} from '../profile/moneyInput';
import {SheetFrame} from '../profile/ProfileSheets';
import {billStatusLine} from './BudgetDetailsScreen';
import {dayMonth} from './budgetCopy';

export type BillAction =
  | {kind: 'markPaid'; amount: number}
  | {kind: 'link'; row: TransactionRow}
  | {kind: 'paidOutside'}
  | {kind: 'notPaid'}
  | {kind: 'dismiss'}
  | {kind: 'undo'}
  | {kind: 'editPayment'; row: TransactionRow};

type BillStatusSheetProps = {
  visible: boolean;
  bill: CycleBill | null;
  cycle: CycleRange | null;
  currencySymbol: string;
  transactions: TransactionRow[];
  /** Expenses already linked to a bill: never offered again. */
  linkedIds: Set<string>;
  onAction: (bill: CycleBill, action: BillAction) => Promise<void>;
  onClose: () => void;
};

/** This cycle's expenses that could be the bill's payment, closest amount first. */
export function paymentCandidates(
  bill: CycleBill,
  rows: TransactionRow[],
  cycle: CycleRange,
  linkedIds: Set<string>,
  limit = 5,
): TransactionRow[] {
  return rows
    .filter(row => {
      const date = calendarDateISO(row.transactionDate);
      return (
        date >= cycle.start &&
        date <= cycle.end &&
        isDayToDaySpend(row, linkedIds)
      );
    })
    .sort(
      (a, b) =>
        Math.abs(a.amount - bill.planned) - Math.abs(b.amount - bill.planned) ||
        (a.transactionDate < b.transactionDate ? 1 : -1),
    )
    .slice(0, limit);
}

export function BillStatusSheet({
  visible,
  bill,
  cycle,
  currencySymbol,
  transactions,
  linkedIds,
  onAction,
  onClose,
}: BillStatusSheetProps) {
  const styles = useStyles();
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && bill) {
      setAmount(String(Math.round(bill.planned)));
      setError(null);
      setBusy(false);
    }
  }, [bill, visible]);

  const candidates = useMemo(
    () => (bill && cycle ? paymentCandidates(bill, transactions, cycle, linkedIds) : []),
    [bill, cycle, linkedIds, transactions],
  );

  if (!bill) {
    return null;
  }

  const run = async (action: BillAction) => {
    setBusy(true);
    setError(null);
    try {
      await onAction(bill, action);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const status = billStatusLine(bill, money);
  const open = bill.status === 'upcoming' || bill.status === 'notPaid';
  const typed = Number(amount);
  const paymentRow =
    bill.status === 'paid' ? transactions.find(row => bill.rowIds.includes(row.id)) : undefined;
  // A due-day copy can be taken back; the series' first row is the bill itself.
  const isCopy = paymentRow !== undefined && paymentRow.id !== bill.billKey && !bill.stored;

  return (
    <SheetFrame visible={visible} title={bill.label} onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        {`${money(bill.paid ?? bill.planned)} · ${status.text}`}
      </AppText>

      {open ? (
        <>
          <TextField
            label="Amount paid"
            prefix={currencySymbol}
            value={groupMoneyInput(amount)}
            onChangeText={text => setAmount(sanitizeMoneyInput(text, true))}
            keyboardType="decimal-pad"
            helper={
              Math.abs(typed - bill.planned) >= 0.01 && typed > 0
                ? `Planned ${money(bill.planned)}. The difference ${
                    typed > bill.planned ? 'comes off' : 'goes back to'
                  } what you can spend this month.`
                : 'Logged as an expense today, kept out of your daily limit.'
            }
          />
          <PrimaryButton
            label="Mark paid today"
            style={styles.action}
            disabled={busy || !(typed > 0)}
            loading={busy}
            onPress={() => run({kind: 'markPaid', amount: typed})}
          />

          {candidates.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="label" color={colors.muted}>
                Already logged it? Pick the payment
              </AppText>
              {candidates.map(row => (
                <PressableScale
                  key={row.id}
                  disabled={busy}
                  onPress={() => run({kind: 'link', row})}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${row.description || row.merchant || 'expense'} of ${money(row.amount)} on ${dayMonth(calendarDateISO(row.transactionDate))}`}
                  style={styles.candidate}>
                  <View style={styles.candidateText}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {row.description || row.merchant || 'Expense'}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {dayMonth(calendarDateISO(row.transactionDate))}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong">{money(row.amount)}</AppText>
                </PressableScale>
              ))}
            </View>
          ) : null}

          <GhostButton
            label="Paid outside Paisa"
            tone="ink"
            disabled={busy}
            style={styles.action}
            onPress={() => run({kind: 'paidOutside'})}
          />
          {bill.status === 'upcoming' ? (
            <GhostButton
              label="Not paid yet"
              tone="ink"
              disabled={busy}
              onPress={() => run({kind: 'notPaid'})}
            />
          ) : null}
          {bill.carried ? (
            <GhostButton
              label="Not owed any more"
              tone="ink"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Stop setting this aside?',
                  `${bill.label} will no longer be held back from your budget, and ${money(
                    bill.planned,
                  )} goes back to what you can spend.`,
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {text: 'Not owed', onPress: () => run({kind: 'dismiss'})},
                  ],
                )
              }
            />
          ) : null}
        </>
      ) : null}

      {bill.status === 'paid' && paymentRow ? (
        <>
          <GhostButton
            label="Change the amount paid"
            tone="ink"
            disabled={busy}
            style={styles.action}
            onPress={() => run({kind: 'editPayment', row: paymentRow})}
          />
          {isCopy ? (
            <GhostButton
              label="Not actually paid yet"
              tone="ink"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Mark as not paid?',
                  `The ${money(paymentRow.amount)} added on ${dayMonth(
                    calendarDateISO(paymentRow.transactionDate),
                  )} is removed. The bill stays set aside until you mark it paid.`,
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {text: 'Not paid yet', onPress: () => run({kind: 'notPaid'})},
                  ],
                )
              }
            />
          ) : null}
        </>
      ) : null}

      {bill.stored && !open ? (
        <GhostButton
          label="Undo"
          tone="ink"
          disabled={busy}
          style={styles.action}
          onPress={() => run({kind: 'undo'})}
        />
      ) : null}

      {error ? (
        <AppText variant="caption" color={colors.roseLight} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </SheetFrame>
  );
}

const useStyles = makeStyles(() => ({
  lead: {
    marginBottom: spacing.lg,
  },
  action: {
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.tile,
    backgroundColor: colors.ground,
  },
  candidateText: {
    flex: 1,
  },
  error: {
    marginTop: spacing.md,
  },
}));
