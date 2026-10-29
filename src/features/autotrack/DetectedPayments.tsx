import React, {useState} from 'react';
import {View} from 'react-native';
import {NotePencil, Receipt} from 'phosphor-react-native';

import {
  AppText,
  Card,
  GradientIconSquare,
  PressableScale,
  Text,
} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {DetectedTxn} from '../../lib/autotrack/types';
import {colors, fonts, makeStyles, radii, withAlpha} from '../../theme';
import {CategoryIconSquare} from '../add/categoryIcons';
import {
  PaymentGroup,
  appName,
  formatClock,
  paymentPill,
  paymentTitle,
  signedAmount,
} from './autoTrackFormat';

const tabular = {fontVariant: ['tabular-nums'] as const};

type PaymentRowProps = {
  item: DetectedTxn;
  currencySymbol: string;
  onKeep: (id: number) => Promise<void> | void;
  onMerge: (id: number) => Promise<void> | void;
};

function PaymentRow({
  item,
  currencySymbol,
  onKeep,
  onMerge,
}: PaymentRowProps) {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const pill = paymentPill(item);
  const amount = signedAmount(item);
  const amountColor =
    item.direction === 'CREDIT'
      ? colors.mint
      : item.direction === 'DEBIT'
        ? colors.roseLight
        : colors.text;
  const amountText = formatMoney(amount, currencySymbol, {signed: true});
  const title = paymentTitle(item);
  const detail = `${appName(item.sourceApp)} · ${formatClock(item.detectedAtMillis)}`;
  const note = item.note?.trim() ?? '';
  const flagged = item.flag !== null;

  const resolve = async (action: (id: number) => Promise<void> | void) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action(item.id);
    } catch {
      // The detector keeps the flag if it could not apply the choice.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[styles.row, styles.rowDivider]}
      accessible={!flagged}
      accessibilityLabel={
        flagged
          ? undefined
          : `${title}, ${detail}, ${amountText}, ${pill.label}${
              note ? `, note: ${note}` : ''
            }`
      }>
      <View style={styles.main}>
        <CategoryIconSquare
          id={item.direction === 'CREDIT' ? 'refund' : 'other'}
          size={40}
        />
        <View style={styles.detail}>
          <Text
            fontFamily={fonts.jakartaSemiBold}
            fontSize={15}
            lineHeight={20}
            color={colors.text}
            numberOfLines={1}>
            {title}
          </Text>
          <Text
            fontFamily={fonts.jakartaRegular}
            fontSize={12}
            lineHeight={17}
            color={colors.muted}
            numberOfLines={1}>
            {detail}
          </Text>
          {note ? (
            <View style={styles.noteRow}>
              <NotePencil size={12} color={colors.muted} />
              <Text
                fontFamily={fonts.jakartaRegular}
                fontSize={12}
                lineHeight={17}
                color={colors.inkSecondary}
                numberOfLines={1}
                style={styles.noteText}>
                {note}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.end}>
          <Text
            fontFamily={fonts.jakartaBold}
            fontSize={15}
            lineHeight={20}
            color={amountColor}
            numberOfLines={1}
            style={tabular}>
            {amountText}
          </Text>
          <View
            style={[styles.pill, {backgroundColor: withAlpha(pill.color, 0.14)}]}>
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={10}
              lineHeight={14}
              color={pill.color}>
              {pill.label}
            </Text>
          </View>
        </View>
      </View>

      {flagged ? (
        <View style={styles.review}>
          <AppText variant="caption" color={colors.inkSecondary}>
            {item.flagReason?.trim() ||
              'This looks like a payment already recorded.'}
          </AppText>
          <View style={styles.actions}>
            <PressableScale
              onPress={() => resolve(onKeep)}
              disabled={busy}
              scaleTo={0.95}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Keep ${title} ${amountText} as a separate payment`}
              accessibilityState={{disabled: busy}}
              style={[styles.action, styles.keep, busy && styles.busy]}>
              <AppText variant="label" color={colors.text}>
                Keep
              </AppText>
            </PressableScale>
            <PressableScale
              onPress={() => resolve(onMerge)}
              disabled={busy}
              scaleTo={0.95}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Merge ${title} ${amountText} into the earlier payment`}
              accessibilityState={{disabled: busy}}
              style={[styles.action, styles.merge, busy && styles.busy]}>
              <AppText variant="label" color={colors.text}>
                Merge
              </AppText>
            </PressableScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}

type DetectedPaymentsProps = {
  groups: PaymentGroup[];
  currencySymbol: string;
  onKeep: (id: number) => Promise<void> | void;
  onMerge: (id: number) => Promise<void> | void;
};

/** Day-grouped cards of detected payments, or the empty state. */
export function DetectedPayments({
  groups,
  currencySymbol,
  onKeep,
  onMerge,
}: DetectedPaymentsProps) {
  const styles = useStyles();
  if (groups.length === 0) {
    return (
      <Card radius={radii.cardHero} padding={0}>
        <View style={styles.emptyInner}>
          <GradientIconSquare size={48} glow>
            <Receipt size={24} color={colors.onAccent} weight="fill" />
          </GradientIconSquare>
          <AppText variant="heading" align="center">
            No payments yet
          </AppText>
          <AppText variant="label" color={colors.muted} align="center">
            Payments you make in Google Pay, PhonePe or Paytm will show up here.
          </AppText>
        </View>
      </Card>
    );
  }

  return (
    <>
      {groups.map(group => (
        <Card
          key={group.date}
          padding={0}
          radius={radii.card}
          style={styles.group}>
          <View style={styles.groupHeader}>
            <AppText variant="heading" accessibilityRole="header">
              {group.label}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {group.items.length === 1
                ? '1 payment'
                : `${group.items.length} payments`}
            </AppText>
          </View>
          {group.items.map(item => (
            <PaymentRow
              key={item.id}
              item={item}
              currencySymbol={currencySymbol}
              onKeep={onKeep}
              onMerge={onMerge}
            />
          ))}
        </Card>
      ))}
    </>
  );
}

const useStyles = makeStyles(() => ({
  group: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detail: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteText: {
    flexShrink: 1,
  },
  end: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  review: {
    marginTop: 10,
    marginLeft: 52,
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    minWidth: 72,
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keep: {
    backgroundColor: withAlpha(colors.violet, 0.28),
    borderColor: withAlpha(colors.lavender, 0.5),
  },
  merge: {
    backgroundColor: 'transparent',
    borderColor: colors.line,
  },
  busy: {
    opacity: 0.5,
  },
  emptyInner: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 32,
    paddingHorizontal: 28,
  },
}));
