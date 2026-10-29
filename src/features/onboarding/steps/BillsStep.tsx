import React, {useRef, useState} from 'react';
import {View, ViewInstance} from 'react-native';
import {
  CalendarBlank,
  CaretDown,
  CaretUp,
  CheckCircle,
  Plus,
  X,
} from 'phosphor-react-native';

import {
  AppText,
  PressableScale,
  Stagger,
  TextField,
} from '../../../components/ui';
import {nextMonthlyDate} from '../../../lib/scheduledSetup';
import {dateFromCalendarISO, localDateISO} from '../../../lib/transactionsStore';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {CategoryIconSquare} from '../../add/categoryIcons';
import {
  BILL_PRESETS,
  STEP_TITLES,
  currencyByCode,
  dayLabel,
} from '../constants';
import {PaydayGrid} from '../components/PaydayGrid';
import {StepLayout} from '../components/StepLayout';
import {BillPreset, OnboardingDraft, RecurringBill} from '../types';

type BillsStepProps = {
  draft: OnboardingDraft;
  errors: Partial<Record<keyof OnboardingDraft, string>>;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
  /** Scrolls a newly added bill's fields into view. */
  onReveal?: (target: ViewInstance) => void;
};

function firstDueLabel(day: number): string {
  return dateFromCalendarISO(nextMonthlyDate(day, localDateISO())).toLocaleDateString(
    'en-IN',
    {day: 'numeric', month: 'short'},
  );
}

export function BillsStep({draft, errors, onChange, onReveal}: BillsStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.bills;
  const currency = currencyByCode(draft.currency);
  const bills = draft.bills ?? [];
  const picked = new Set(bills.map(bill => bill.id));
  const total = bills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);
  // The bill whose calendar is open; a new bill opens its own.
  const [openId, setOpenId] = useState<string | null>(null);
  const showErrors = Boolean(errors.bills);
  // The bill just added, scrolled to once it has laid out.
  const revealId = useRef<string | null>(null);
  const billViews = useRef(new Map<string, ViewInstance>());

  const add = (bill: RecurringBill) => {
    onChange('bills', [...bills, bill]);
    setOpenId(bill.id);
    revealId.current = bill.id;
  };

  const toggle = (preset: BillPreset) => {
    if (picked.has(preset.id)) {
      onChange('bills', bills.filter(bill => bill.id !== preset.id));
      return;
    }
    add({...preset, amount: '', day: null});
  };

  const addCustom = () => {
    add({
      id: `custom-${Date.now()}`,
      label: '',
      slug: 'bills',
      amount: '',
      day: null,
      custom: true,
    });
  };

  const remove = (id: string) => {
    onChange('bills', bills.filter(bill => bill.id !== id));
  };

  const patch = (id: string, change: Partial<RecurringBill>) => {
    onChange(
      'bills',
      bills.map(bill => (bill.id === id ? {...bill, ...change} : bill)),
    );
  };

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.presets}>
          {BILL_PRESETS.map(preset => {
            const selected = picked.has(preset.id);
            return (
              <PressableScale
                key={preset.id}
                onPress={() => toggle(preset)}
                accessibilityRole="checkbox"
                accessibilityState={{checked: selected}}
                accessibilityLabel={preset.label}
                containerStyle={styles.presetWrap}
                style={[styles.preset, selected && styles.presetSelected]}>
                <CategoryIconSquare id={preset.slug} size={32} />
                <AppText variant="bodyStrong" style={styles.presetLabel} numberOfLines={1}>
                  {preset.label}
                </AppText>
                {selected ? (
                  <CheckCircle size={20} color={colors.violet} weight="fill" />
                ) : (
                  <Plus size={16} color={colors.muted} />
                )}
              </PressableScale>
            );
          })}
        </View>
        <PressableScale
          onPress={addCustom}
          accessibilityRole="button"
          accessibilityLabel="Add another bill"
          style={styles.addCustom}>
          <Plus size={16} color={colors.violet} weight="bold" />
          <AppText variant="bodyStrong" color={colors.violet}>
            Add another bill
          </AppText>
        </PressableScale>
      </Stagger>

      {bills.length > 0 ? (
        <Stagger index={2} style={styles.spaced}>
          <AppText variant="label" color={colors.muted} style={styles.groupLabel}>
            Amount and due date
          </AppText>
          <View style={styles.list}>
            {bills.map(bill => {
              const open = openId === bill.id;
              const missingAmount = showErrors && !(Number(bill.amount) > 0);
              const missingDay = showErrors && bill.day === null;
              return (
                <View
                  key={bill.id}
                  style={styles.bill}
                  ref={view => {
                    if (view) {
                      billViews.current.set(bill.id, view);
                    } else {
                      billViews.current.delete(bill.id);
                    }
                  }}
                  onLayout={() => {
                    const view = billViews.current.get(bill.id);
                    if (revealId.current === bill.id && view) {
                      revealId.current = null;
                      onReveal?.(view);
                    }
                  }}>
                  <View style={styles.billHead}>
                    <CategoryIconSquare id={bill.slug} size={36} />
                    {bill.custom ? (
                      <TextField
                        label="Bill name"
                        placeholder="Car EMI, school fees…"
                        value={bill.label}
                        onChangeText={value => patch(bill.id, {label: value})}
                        autoCapitalize="words"
                        returnKeyType="done"
                        error={showErrors && !bill.label.trim() ? 'Name it' : undefined}
                        style={styles.billNameField}
                      />
                    ) : (
                      <AppText variant="heading" style={styles.billName}>
                        {bill.label}
                      </AppText>
                    )}
                    <PressableScale
                      onPress={() => remove(bill.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${bill.label || 'bill'}`}
                      hitSlop={8}
                      style={styles.remove}>
                      <X size={16} color={colors.muted} />
                    </PressableScale>
                  </View>

                  <TextField
                    label="Amount every month"
                    placeholder="0"
                    prefix={currency.symbol}
                    value={bill.amount}
                    onChangeText={value =>
                      patch(bill.id, {amount: value.replace(/[^0-9]/g, '')})
                    }
                    keyboardType="number-pad"
                    returnKeyType="done"
                    error={missingAmount ? 'Add the amount' : undefined}
                    style={styles.amount}
                  />

                  <PressableScale
                    onPress={() => setOpenId(open ? null : bill.id)}
                    accessibilityRole="button"
                    accessibilityState={{expanded: open}}
                    accessibilityLabel={
                      bill.day === null
                        ? `Pick the due date for ${bill.label || 'this bill'}`
                        : `Due on the ${dayLabel(bill.day)}, change`
                    }
                    style={[styles.due, missingDay && styles.dueMissing]}>
                    <CalendarBlank
                      size={20}
                      color={missingDay ? colors.roseLight : colors.text}
                    />
                    <View style={styles.dueText}>
                      <AppText variant="caption" color={colors.muted}>
                        Due date
                      </AppText>
                      <AppText
                        variant="bodyStrong"
                        color={
                          bill.day === null
                            ? missingDay
                              ? colors.roseLight
                              : colors.muted
                            : colors.text
                        }>
                        {bill.day === null
                          ? 'Pick a day'
                          : `${dayLabel(bill.day)} of every month`}
                      </AppText>
                    </View>
                    {open ? (
                      <CaretUp size={18} color={colors.muted} />
                    ) : (
                      <CaretDown size={18} color={colors.muted} />
                    )}
                  </PressableScale>

                  {open ? (
                    <View style={styles.calendar}>
                      <PaydayGrid
                        value={bill.day}
                        onSelect={day => {
                          patch(bill.id, {day});
                          setOpenId(null);
                        }}
                      />
                    </View>
                  ) : bill.day !== null ? (
                    <AppText variant="caption" color={colors.muted} style={styles.firstDue}>
                      {`Added as an expense on ${firstDueLabel(bill.day)}, then every month.`}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
          {errors.bills ? (
            <AppText variant="caption" color={colors.roseLight} style={styles.error}>
              {errors.bills}
            </AppText>
          ) : null}
        </Stagger>
      ) : null}

      {total > 0 ? (
        <Stagger index={3} style={styles.spaced}>
          <View style={styles.readout}>
            <AppText variant="caption" color={colors.muted}>
              Committed every month
            </AppText>
            <AppText variant="numericHero" style={styles.readoutValue}>
              {currency.symbol}
              {total.toLocaleString('en-IN')}
            </AppText>
            <AppText variant="body" color={colors.muted}>
              Taken off your budget first, so the daily limit only counts
              what is left. Edit or stop a bill from Activity.
            </AppText>
          </View>
        </Stagger>
      ) : null}
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  presetWrap: {
    width: '50%',
    padding: spacing.xs,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.tile,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  presetSelected: {
    borderColor: colors.violet,
    backgroundColor: colors.accentSoft,
  },
  presetLabel: {
    flex: 1,
  },
  addCustom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.tile,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lavender,
  },
  spaced: {
    marginTop: spacing.xxl,
  },
  groupLabel: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  list: {
    gap: spacing.md,
  },
  bill: {
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  billHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  billName: {
    flex: 1,
  },
  billNameField: {
    flex: 1,
  },
  remove: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasSunk,
  },
  amount: {
    marginTop: spacing.lg,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.field,
  },
  dueMissing: {
    borderColor: colors.roseLight,
  },
  dueText: {
    flex: 1,
    gap: 2,
  },
  calendar: {
    marginTop: spacing.md,
  },
  firstDue: {
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  error: {
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  readout: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
  },
  readoutValue: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    fontSize: 36,
    lineHeight: 42,
  },
}));
