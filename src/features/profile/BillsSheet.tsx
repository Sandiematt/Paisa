import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {CaretRight} from 'phosphor-react-native/src/icons/CaretRight';
import {Plus} from 'phosphor-react-native/src/icons/Plus';

import {
  AppText,
  GhostButton,
  PressableScale,
  PrimaryButton,
  TextField,
} from '../../components/ui';
import {BillInput, EditableBill} from '../../lib/bills';
import {colors, makeStyles, radii, spacing} from '../../theme';
import {PaydayGrid} from '../onboarding/components/PaydayGrid';
import {dayLabel} from '../onboarding/constants';
import {SheetFrame} from './ProfileSheets';
import {groupMoneyInput, sanitizeMoneyInput} from './moneyInput';

type BillsSheetProps = {
  visible: boolean;
  bills: EditableBill[];
  symbol: string;
  /** Saves a changed bill, or a new one when `bill` is null. Rejects with what went wrong. */
  onSave: (bill: EditableBill | null, input: BillInput) => Promise<void>;
  onRemove: (bill: EditableBill) => Promise<void>;
  onClose: () => void;
};

/** The monthly bills: tap one to change or stop it, or add a new one. */
export function BillsSheet({visible, bills, symbol, onSave, onRemove, onClose}: BillsSheetProps) {
  const styles = useStyles();
  // undefined lists the bills; null edits a new one.
  const [editing, setEditing] = useState<EditableBill | null | undefined>(undefined);
  const money = (amount: number) => `${symbol}${amount.toLocaleString('en-IN')}`;
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0);

  useEffect(() => {
    if (visible) {
      setEditing(undefined);
    }
  }, [visible]);

  if (editing !== undefined) {
    return (
      <SheetFrame
        visible={visible}
        title={editing ? 'Edit bill' : 'Add a bill'}
        onClose={onClose}>
        <BillForm
          bill={editing}
          symbol={symbol}
          onSave={input => onSave(editing, input).then(() => setEditing(undefined))}
          onRemove={editing ? () => onRemove(editing).then(() => setEditing(undefined)) : undefined}
          onCancel={() => setEditing(undefined)}
        />
      </SheetFrame>
    );
  }

  return (
    <SheetFrame visible={visible} title="Monthly bills" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        {bills.length > 0
          ? `${money(total)} a month, taken off your budget before day-to-day spending.`
          : 'Rent, EMIs, recharges: add what you pay every month and it comes off your budget first.'}
      </AppText>
      <View style={styles.list}>
        {bills.map(bill => (
          <PressableScale
            key={bill.key}
            onPress={() => setEditing(bill)}
            accessibilityRole="button"
            accessibilityLabel={`${bill.label}, ${money(bill.amount)}, due on the ${dayLabel(bill.day)}. Edit`}
            style={styles.row}>
            <View style={styles.rowText}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {bill.label}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {`${dayLabel(bill.day)} of every month`}
              </AppText>
            </View>
            <AppText variant="bodyStrong">{money(bill.amount)}</AppText>
            <CaretRight size={16} color={colors.muted} weight="bold" />
          </PressableScale>
        ))}
      </View>
      <PressableScale
        onPress={() => setEditing(null)}
        accessibilityRole="button"
        accessibilityLabel="Add a bill"
        style={[styles.row, styles.addRow]}>
        <Plus size={18} color={colors.lavender} weight="bold" />
        <AppText variant="bodyStrong" color={colors.lavender}>
          Add a bill
        </AppText>
      </PressableScale>
    </SheetFrame>
  );
}

function BillForm({
  bill,
  symbol,
  onSave,
  onRemove,
  onCancel,
}: {
  bill: EditableBill | null;
  symbol: string;
  onSave: (input: BillInput) => Promise<void>;
  onRemove?: () => Promise<void>;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const [label, setLabel] = useState(bill?.label ?? '');
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [day, setDay] = useState<number | null>(bill?.day ?? null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const value = Number(amount);
    if (!label.trim()) {
      setError('Give the bill a name.');
    } else if (!(value > 0)) {
      setError('Add the amount.');
    } else if (day === null) {
      setError('Pick the day it is due.');
    } else {
      run(() => onSave({label: label.trim(), amount: value, day}));
    }
  };

  return (
    <View>
      <TextField
        label="Name"
        value={label}
        onChangeText={setLabel}
        placeholder="e.g. Rent"
        autoCapitalize="sentences"
        returnKeyType="next"
      />
      <TextField
        label="Amount"
        prefix={symbol}
        value={groupMoneyInput(amount)}
        onChangeText={text => setAmount(sanitizeMoneyInput(text, false))}
        keyboardType="number-pad"
        placeholder="0"
        style={styles.field}
      />
      <AppText variant="label" color={colors.muted} style={styles.dayTitle}>
        {day ? `Due on the ${dayLabel(day).toLowerCase()} of every month` : 'Due on'}
      </AppText>
      <PaydayGrid value={day} onSelect={setDay} />
      <AppText variant="caption" color={colors.muted} style={styles.note}>
        {bill
          ? 'Changes apply from the next payment. Payments already made stay as they are.'
          : 'It is added on its due date each month, starting with the next one.'}
      </AppText>
      {error ? (
        <AppText variant="caption" color={colors.roseLight} style={styles.note}>
          {error}
        </AppText>
      ) : null}
      <PrimaryButton
        label={bill ? 'Save changes' : 'Add bill'}
        loading={busy}
        onPress={save}
        style={styles.action}
      />
      {onRemove ? (
        <GhostButton
          label="Stop this bill"
          disabled={busy}
          onPress={() => run(onRemove)}
          style={styles.secondary}
        />
      ) : null}
      <GhostButton label="Back to bills" disabled={busy} onPress={onCancel} style={styles.secondary} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  lead: {
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  addRow: {
    marginTop: spacing.sm,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  field: {
    marginTop: spacing.md,
  },
  dayTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  note: {
    marginTop: spacing.md,
  },
  action: {
    marginTop: spacing.xl,
  },
  secondary: {
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
}));
