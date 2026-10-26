import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  CalendarBlank,
  CaretDown,
  CaretUp,
  CheckCircle,
  CircleIcon,
  CopySimple,
  Warning,
} from 'phosphor-react-native';

import {
  AppText,
  BackButton,
  GhostButton,
  GradientView,
  LoadingState,
  PressableScale,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  TextField,
} from '../../components/ui';
import {
  categoryByName,
  categoryForSlug,
  CategoryRow,
  findOrCreateUserCategory,
  loadCategories,
} from '../../lib/categoriesStore';
import {formatMoney, parseAmountInput} from '../../lib/formatMoney';
import {suggestCategory} from '../../lib/receipts/classifyReceipt';
import {itemsNetCents, parseReceipt} from '../../lib/receipts/parseReceipt';
import {
  DuplicateMatch,
  findReceiptDuplicates,
} from '../../lib/receipts/receiptDuplicates';
import {
  buildReceiptMergePatch,
  buildReceiptTransaction,
  centsToInput,
  ReceiptReviewInput,
  selectedTotalCents,
  summarizeItems,
} from '../../lib/receipts/receiptTransaction';
import {recognizeReceiptText} from '../../lib/receipts/scanReceipt';
import {ParsedReceipt, ReceiptLineItem} from '../../lib/receipts/types';
import {MoneyFlow} from '../../lib/supabase/database.types';
import {
  createTransaction,
  dateFromCalendarISO,
  DETECTED_NOTE_LIMIT,
  localDateISO,
  TransactionRow,
  updateTransaction,
} from '../../lib/transactionsStore';
import {
  colors,
  layout,
  linearGradient,
  radii,
  spacing,
  typography,
  withAlpha,
} from '../../theme';
import {CategoryIconSquare} from '../add/categoryIcons';
import {
  CategoryOption,
  EXPENSE_GRID,
  INCOME_CATEGORIES,
} from '../add/categoryOptions';
import {DatePickerSheet} from '../add/DatePickerSheet';

export type ReceiptImage = {uri: string; width: number};

type ReceiptReviewScreenProps = {
  /** The photo to read; the screen is open while this is set. */
  image: ReceiptImage | null;
  currencySymbol: string;
  /** The ledger, to warn before saving a receipt that is already there. */
  transactions: TransactionRow[];
  onClose: () => void;
  /** `merged` when the receipt was folded into an existing row. */
  onSaved: (row: TransactionRow, merged: boolean) => void;
};

type Phase =
  | {kind: 'reading'}
  | {kind: 'error'; message: string}
  | {kind: 'review'; receipt: ParsedReceipt};

const KIND_OPTIONS = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
] as const;

const GLOW_HEIGHT = 300;
const GLOW_IMAGE = linearGradient([colors.glow, colors.ground], 180);
const THUMB_WIDTH = 64;
const SLOW_READ_MS = 8000;

function optionsFor(type: MoneyFlow): CategoryOption[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_GRID;
}

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  const head =
    firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot)}.${cleaned
          .slice(firstDot + 1)
          .replace(/\./g, '')}`;
  const [whole, fraction] = head.split('.');
  const digits = whole.replace(/^0+(?=\d)/, '').slice(0, 9);
  return fraction !== undefined
    ? `${digits || '0'}.${fraction.slice(0, 2)}`
    : digits;
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isUniqueViolation(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : '';
  return /duplicate|unique/i.test(message);
}

function duplicateCopy(
  match: DuplicateMatch,
  money: (cents: number) => string,
): {title: string; body: string} {
  const {row} = match;
  const what = `${money(Math.round(row.amount * 100))} · ${
    row.merchant || row.description || 'Untitled'
  } · ${dateLabel(dateFromCalendarISO(row.transactionDate))}`;
  if (match.strength === 'exact') {
    return {title: 'You already saved this receipt', body: what};
  }
  if (row.source === 'upi_auto') {
    return {
      title: 'Auto-tracking may have saved this payment',
      body: `${what}. Add the receipt's details to it instead of saving it twice.`,
    };
  }
  return {
    title:
      match.strength === 'likely'
        ? 'This looks like a duplicate'
        : 'A payment like this is already saved',
    body: what,
  };
}

export function ReceiptReviewScreen({
  image,
  currencySymbol,
  transactions,
  onClose,
  onSaved,
}: ReceiptReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const visible = image !== null;

  const [phase, setPhase] = useState<Phase>({kind: 'reading'});
  const [type, setType] = useState<MoneyFlow>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [saveCopy, setSaveCopy] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [showText, setShowText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbCategories, setDbCategories] = useState<CategoryRow[]>([]);
  // Most scans finish in a few seconds; when OCR is busy it can take up to a minute.
  const [slowRead, setSlowRead] = useState(false);
  const attempt = useRef(0);

  useEffect(() => {
    setSlowRead(false);
    if (phase.kind !== 'reading') {
      return;
    }
    const timer = setTimeout(() => setSlowRead(true), SLOW_READ_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const money = useCallback(
    (cents: number) =>
      formatMoney(cents, currencySymbol, {
        fromCents: true,
        decimals: cents % 100 === 0 ? 0 : 2,
      }),
    [currencySymbol],
  );

  const read = useCallback(
    async (target: ReceiptImage) => {
      const id = ++attempt.current;
      setPhase({kind: 'reading'});
      try {
        const lines = await recognizeReceiptText(target.uri, target.width);
        if (id !== attempt.current) {
          return;
        }
        if (lines.length === 0) {
          setPhase({
            kind: 'error',
            message:
              'No text was found on this photo. Try a sharper, well-lit photo of the whole receipt.',
          });
          return;
        }
        const receipt = parseReceipt(lines, {
          today: localDateISO(),
          // Dollar receipts usually print the month first.
          dayFirst: currencySymbol !== '$',
        });
        setType(receipt.classification.type);
        setAmount(receipt.amountCents ? centsToInput(receipt.amountCents) : '');
        setMerchant(receipt.merchant ?? '');
        setDate(receipt.date ? dateFromCalendarISO(receipt.date) : new Date());
        setCategoryId(receipt.suggestedCategoryId);
        setNote(summarizeItems(receipt.lineItems));
        setPhase({kind: 'review', receipt});
      } catch (caught) {
        if (id !== attempt.current) {
          return;
        }
        setPhase({
          kind: 'error',
          message:
            caught instanceof Error
              ? caught.message
              : 'Could not read the receipt.',
        });
      }
    },
    [currencySymbol],
  );

  useEffect(() => {
    if (!image) {
      attempt.current += 1;
      return;
    }
    setExcluded(new Set());
    setDismissed(new Set());
    setSaveCopy(false);
    setShowText(false);
    setSaving(false);
    setDateOpen(false);
    read(image);
    let cancelled = false;
    loadCategories()
      .then(rows => !cancelled && setDbCategories(rows))
      .catch(() => !cancelled && setDbCategories([]));
    return () => {
      cancelled = true;
    };
  }, [image, read]);

  const receipt = phase.kind === 'review' ? phase.receipt : null;
  const amountCents = Math.round(parseAmountInput(amount) * 100);
  const dateISO = localDateISO(date);

  const duplicates = useMemo(() => {
    if (!receipt || amountCents <= 0) {
      return [];
    }
    return findReceiptDuplicates(
      {type, amountCents, date: dateISO, merchant: merchant.trim() || null},
      transactions,
    ).filter(match => !dismissed.has(match.row.id));
  }, [amountCents, dateISO, dismissed, merchant, receipt, transactions, type]);

  const topDuplicate = duplicates[0] ?? null;
  const blockedByDuplicate =
    topDuplicate !== null &&
    ((topDuplicate.strength === 'exact' && !saveCopy) ||
      topDuplicate.strength === 'likely');

  const options = optionsFor(type);
  const selectedCategory = options.find(item => item.id === categoryId) ?? null;

  const onTypeChange = (next: MoneyFlow) => {
    if (next === type || !receipt) {
      return;
    }
    setType(next);
    const suggestion = suggestCategory({
      type: next,
      merchant: merchant || null,
      lines: receipt.rawLines,
    });
    setCategoryId(
      optionsFor(next).some(item => item.id === suggestion) ? suggestion : null,
    );
  };

  const toggleItem = (item: ReceiptLineItem) => {
    setExcluded(current => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  };

  const reviewInput = (): ReceiptReviewInput => ({
    type,
    amount,
    merchant,
    date: dateISO,
    categoryId: null,
    categoryName: selectedCategory?.label ?? null,
    note,
    paymentMethod: receipt?.paymentMethod ?? null,
    duplicateSalt:
      topDuplicate?.strength === 'exact' && saveCopy
        ? String(Date.now())
        : undefined,
  });

  const resolveCategory = async (): Promise<CategoryRow | null> => {
    if (!selectedCategory) {
      return null;
    }
    return (
      categoryForSlug(dbCategories, selectedCategory.id, type) ??
      categoryByName(dbCategories, selectedCategory.label, type) ??
      (await findOrCreateUserCategory(selectedCategory.label, type))
    );
  };

  const handleSave = async () => {
    if (saving || blockedByDuplicate) {
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const category = await resolveCategory();
      const built = buildReceiptTransaction({
        ...reviewInput(),
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? selectedCategory?.label ?? null,
      });
      if (!built.ok) {
        Alert.alert('Check the receipt', built.error);
        return;
      }
      const saved = await createTransaction(built.payload);
      onSaved(saved, false);
    } catch (caught) {
      if (isUniqueViolation(caught)) {
        Alert.alert(
          'Already saved',
          'This receipt is already in your ledger, so it was not added again.',
        );
        return;
      }
      Alert.alert(
        'Could not save',
        caught instanceof Error ? caught.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMerge = async (row: TransactionRow) => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const category = await resolveCategory();
      const patch = buildReceiptMergePatch(row, {
        ...reviewInput(),
        categoryId: category?.id ?? null,
      });
      const updated =
        Object.keys(patch).length > 0
          ? await updateTransaction(row.id, patch)
          : row;
      onSaved(updated, true);
    } catch (caught) {
      Alert.alert(
        'Could not update',
        caught instanceof Error ? caught.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const tone = type === 'income' ? colors.mint : colors.roseLight;
  const submitLabel = saving
    ? 'Saving…'
    : blockedByDuplicate
    ? 'Choose an option above'
    : amountCents > 0
    ? `Save ${type} · ${money(amountCents)}`
    : `Save ${type}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View
          pointerEvents="none"
          style={[styles.glow, {backgroundImage: GLOW_IMAGE}]}
        />
        <KeyboardAvoidingView
          style={[styles.screen, {paddingTop: insets.top}]}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : insets.top}>
          <View style={styles.topBar}>
            <BackButton onPress={onClose} />
            <View style={styles.headerCopy}>
              <AppText variant="title" color={colors.text}>
                Review receipt
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {phase.kind === 'review'
                  ? 'Check what was read before saving'
                  : 'Reading the printed text'}
              </AppText>
            </View>
          </View>

          {phase.kind === 'reading' ? (
            <View style={styles.center}>
              {image ? (
                <Image
                  source={{uri: image.uri}}
                  style={styles.readingThumb}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <LoadingState
                label={
                  slowRead
                    ? 'Still reading. This can take up to a minute when the scanner is busy.'
                    : 'Reading your receipt'
                }
                caption
              />
            </View>
          ) : null}

          {phase.kind === 'error' ? (
            <View style={styles.center}>
              <Warning size={40} color={colors.gold} weight="duotone" />
              <AppText
                variant="heading"
                color={colors.text}
                align="center"
                style={styles.errorTitle}>
                Couldn't read this receipt
              </AppText>
              <AppText variant="body" color={colors.muted} align="center">
                {phase.message}
              </AppText>
              <View style={styles.errorActions}>
                <PrimaryButton
                  label="Try again"
                  onPress={() => image && read(image)}
                />
                <GhostButton label="Enter it manually" onPress={onClose} />
              </View>
            </View>
          ) : null}

          {receipt ? (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.summaryCard}>
                  {image ? (
                    <Image
                      source={{uri: image.uri}}
                      style={styles.thumb}
                      resizeMode="cover"
                      accessibilityLabel="Scanned receipt"
                    />
                  ) : null}
                  <View style={styles.summaryCopy}>
                    <AppText
                      variant="heading"
                      color={colors.text}
                      numberOfLines={1}>
                      {merchant.trim() || 'Unknown merchant'}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {dateLabel(date)}
                      {receipt.lineItems.length
                        ? ` · ${receipt.lineItems.length} ${
                            receipt.lineItems.length === 1 ? 'item' : 'items'
                          }`
                        : ''}
                      {receipt.paymentMethod
                        ? ` · ${receipt.paymentMethod}`
                        : ''}
                    </AppText>
                    <AppText variant="numeric" color={tone}>
                      {amountCents > 0
                        ? money(type === 'income' ? amountCents : -amountCents)
                        : '—'}
                    </AppText>
                  </View>
                </View>

                {topDuplicate ? (
                  <DuplicateBanner
                    match={topDuplicate}
                    money={money}
                    busy={saving}
                    saveCopy={saveCopy}
                    onSaveCopy={() => setSaveCopy(true)}
                    onDifferent={() =>
                      setDismissed(
                        current => new Set([...current, topDuplicate.row.id]),
                      )
                    }
                    onMerge={() => handleMerge(topDuplicate.row)}
                  />
                ) : null}

                <SegmentedControl
                  options={KIND_OPTIONS}
                  value={type}
                  onChange={onTypeChange}
                  accessibilityLabel="Transaction type"
                  style={styles.kindControl}
                />
                <AppText
                  variant="caption"
                  color={
                    receipt.classification.confidence === 'low'
                      ? colors.gold
                      : colors.muted
                  }
                  style={styles.kindHint}>
                  {type !== receipt.classification.type
                    ? `Changed from ${receipt.classification.type}, which the receipt suggested`
                    : receipt.classification.confidence === 'low'
                    ? 'Not sure whether this is money in or out. Check it.'
                    : `Detected as ${type}: ${receipt.classification.reasons
                        .join(', ')
                        .toLowerCase()}`}
                </AppText>

                <View style={styles.amountRow}>
                  <AppText variant="numericHero" color={tone}>
                    {currencySymbol}
                  </AppText>
                  <TextInput
                    value={amount}
                    onChangeText={text => setAmount(sanitizeAmount(text))}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    selectionColor={colors.lavender}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    returnKeyType="done"
                    blurOnSubmit
                    underlineColorAndroid="transparent"
                    accessibilityLabel={`Total, ${amount || 'empty'}`}
                    style={styles.amountDigits}
                  />
                </View>
                <TotalCheck
                  receipt={receipt}
                  amountCents={amountCents}
                  excluded={excluded}
                  money={money}
                  onUse={cents => setAmount(centsToInput(cents))}
                />

                <TextField
                  label="Merchant"
                  placeholder="Who was paid?"
                  value={merchant}
                  onChangeText={setMerchant}
                  autoCapitalize="words"
                  returnKeyType="done"
                  blurOnSubmit
                  underlineColorAndroid="transparent"
                  style={styles.field}
                />

                <PressableScale
                  onPress={() => {
                    Keyboard.dismiss();
                    setDateOpen(true);
                  }}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={`Date, ${dateLabel(date)}${
                    receipt.date ? '' : ', not found on the receipt'
                  }`}
                  accessibilityHint="Opens the date picker"
                  style={styles.dateRow}>
                  <CalendarBlank
                    size={18}
                    color={colors.lavender}
                    weight="bold"
                  />
                  <View style={styles.dateCopy}>
                    <AppText variant="label" color={colors.muted}>
                      Date
                    </AppText>
                    <AppText variant="bodyStrong" color={colors.text}>
                      {dateLabel(date)}
                    </AppText>
                  </View>
                  {receipt.date ? null : (
                    <AppText variant="caption" color={colors.gold}>
                      Not on receipt
                    </AppText>
                  )}
                  <CaretDown size={14} color={colors.muted} weight="bold" />
                </PressableScale>

                <AppText
                  variant="sectionTitle"
                  color={colors.text}
                  style={styles.sectionTitle}>
                  Category
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}>
                  {options.map(item => {
                    const selected = item.id === categoryId;
                    return (
                      <PressableScale
                        key={item.id}
                        onPress={() => setCategoryId(selected ? null : item.id)}
                        scaleTo={0.96}
                        accessibilityRole="radio"
                        accessibilityLabel={item.label}
                        accessibilityState={{selected}}
                        style={[
                          styles.categoryChip,
                          selected && styles.categoryChipOn,
                        ]}>
                        <CategoryIconSquare
                          id={item.id}
                          size={28}
                          glow={selected}
                        />
                        <AppText
                          variant="label"
                          color={selected ? colors.text : colors.muted}>
                          {item.label}
                        </AppText>
                      </PressableScale>
                    );
                  })}
                </ScrollView>

                {receipt.lineItems.length > 0 ? (
                  <LineItems
                    receipt={receipt}
                    excluded={excluded}
                    money={money}
                    onToggle={toggleItem}
                  />
                ) : null}

                <TextField
                  label="Note (optional)"
                  placeholder="What was this for?"
                  value={note}
                  onChangeText={setNote}
                  helper={`${note.length}/${DETECTED_NOTE_LIMIT}`}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  blurOnSubmit
                  maxLength={DETECTED_NOTE_LIMIT}
                  underlineColorAndroid="transparent"
                  style={styles.field}
                />

                <PressableScale
                  onPress={() => setShowText(current => !current)}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityState={{expanded: showText}}
                  accessibilityLabel={`${
                    showText ? 'Hide' : 'Show'
                  } scanned text`}
                  style={styles.rawToggle}>
                  <AppText variant="label" color={colors.lavender}>
                    {showText ? 'Hide scanned text' : 'Show scanned text'}
                  </AppText>
                  {showText ? (
                    <CaretUp size={12} color={colors.lavender} weight="bold" />
                  ) : (
                    <CaretDown
                      size={12}
                      color={colors.lavender}
                      weight="bold"
                    />
                  )}
                </PressableScale>
                {showText ? (
                  <View style={styles.rawBox}>
                    {receipt.rawLines.map((line, index) => (
                      <AppText
                        key={`${index}-${line}`}
                        variant="caption"
                        color={colors.inkSecondary}
                        style={styles.rawLine}>
                        {line}
                      </AppText>
                    ))}
                  </View>
                ) : null}
              </ScrollView>

              <View
                style={[
                  styles.dock,
                  {paddingBottom: Math.max(insets.bottom, spacing.md)},
                ]}>
                <GradientView
                  pointerEvents="none"
                  gradient={[withAlpha(colors.ground, 0), colors.ground]}
                  angle={180}
                  style={styles.dockFade}
                />
                <PrimaryButton
                  label={submitLabel}
                  onPress={handleSave}
                  disabled={saving || blockedByDuplicate || amountCents <= 0}
                  loading={saving}
                  accessibilityHint={`Saves this ${type} to your ledger`}
                />
              </View>
            </>
          ) : null}

          <DatePickerSheet
            visible={dateOpen}
            value={date}
            onClose={() => setDateOpen(false)}
            onChange={setDate}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DuplicateBanner({
  match,
  money,
  busy,
  saveCopy,
  onSaveCopy,
  onDifferent,
  onMerge,
}: {
  match: DuplicateMatch;
  money: (cents: number) => string;
  busy: boolean;
  saveCopy: boolean;
  onSaveCopy: () => void;
  onDifferent: () => void;
  onMerge: () => void;
}) {
  const copy = duplicateCopy(match, money);
  const exact = match.strength === 'exact';
  return (
    <View style={styles.dupCard} accessibilityRole="alert">
      <View style={styles.dupHead}>
        <CopySimple size={18} color={colors.gold} weight="bold" />
        <AppText variant="bodyStrong" color={colors.text} style={styles.flex}>
          {copy.title}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.muted}>
        {copy.body}
      </AppText>
      {exact ? (
        saveCopy ? (
          <AppText variant="caption" color={colors.gold}>
            It will be saved as a second, separate entry.
          </AppText>
        ) : (
          <View style={styles.dupActions}>
            <SecondaryButton
              label="Save another copy"
              onPress={onSaveCopy}
              accessibilityHint="Saves this receipt again as a separate entry"
              style={styles.flex}
            />
          </View>
        )
      ) : (
        <View style={styles.dupActions}>
          <SecondaryButton
            label={busy ? 'Updating…' : 'Add details to it'}
            onPress={onMerge}
            accessibilityHint="Adds the merchant, category and note to the saved entry instead of saving a new one"
            style={styles.flex}
          />
          <GhostButton label="It's a different one" onPress={onDifferent} />
        </View>
      )}
    </View>
  );
}

function TotalCheck({
  receipt,
  amountCents,
  excluded,
  money,
  onUse,
}: {
  receipt: ParsedReceipt;
  amountCents: number;
  excluded: ReadonlySet<string>;
  money: (cents: number) => string;
  onUse: (cents: number) => void;
}) {
  const selection =
    excluded.size > 0
      ? selectedTotalCents(receipt.lineItems, receipt.extrasCents, excluded)
      : null;
  if (selection !== null && Math.abs(selection) !== amountCents) {
    return (
      <PressableScale
        onPress={() => onUse(Math.abs(selection))}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Use the ticked items' total, ${money(
          Math.abs(selection),
        )}`}
        style={styles.checkRow}>
        <AppText variant="caption" color={colors.muted} style={styles.flex}>
          Ticked items come to {money(Math.abs(selection))}
          {receipt.extrasCents !== 0
            ? ', with their share of tax and charges'
            : ''}
        </AppText>
        <AppText variant="label" color={colors.lavender}>
          Use this
        </AppText>
      </PressableScale>
    );
  }

  const {check} = receipt;
  const printed = receipt.totalCents;
  if (printed !== null && amountCents !== printed && excluded.size === 0) {
    return (
      <PressableScale
        onPress={() => onUse(printed)}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Use the printed total, ${money(printed)}`}
        style={styles.checkRow}>
        <AppText variant="caption" color={colors.muted} style={styles.flex}>
          The receipt's total is {money(printed)}
        </AppText>
        <AppText variant="label" color={colors.lavender}>
          Use this
        </AppText>
      </PressableScale>
    );
  }

  let icon: React.ReactNode = null;
  let text = '';
  let color: string = colors.muted;
  switch (check.status) {
    case 'matched':
      icon = <CheckCircle size={16} color={colors.mint} weight="fill" />;
      text =
        receipt.lineItems.length > 0
          ? 'Items, tax and charges add up to the printed total'
          : 'Subtotal and tax add up to the printed total';
      break;
    case 'mismatch': {
      icon = <Warning size={16} color={colors.gold} weight="fill" />;
      const gap = money(Math.abs(check.differenceCents));
      text = `The lines read add up to ${gap} ${
        check.differenceCents > 0 ? 'less' : 'more'
      } than the printed total. A line may be misread; check the items.`;
      color = colors.gold;
      break;
    }
    case 'total_only':
      text = 'Only the total could be read from this receipt.';
      break;
    case 'computed':
      text = 'No total printed, so this is what the items add up to.';
      break;
    case 'none':
      icon = <Warning size={16} color={colors.gold} weight="fill" />;
      text = 'No amount could be read. Enter the total.';
      color = colors.gold;
      break;
  }
  return (
    <View style={styles.checkRow} accessible accessibilityLabel={text}>
      {icon}
      <AppText variant="caption" color={color} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function LineItems({
  receipt,
  excluded,
  money,
  onToggle,
}: {
  receipt: ParsedReceipt;
  excluded: ReadonlySet<string>;
  money: (cents: number) => string;
  onToggle: (item: ReceiptLineItem) => void;
}) {
  const selected = receipt.lineItems.filter(item => !excluded.has(item.id));
  const net = itemsNetCents(selected);
  return (
    <>
      <View style={styles.sectionHead}>
        <AppText variant="sectionTitle" color={colors.text}>
          Items
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Untick any that aren't yours
        </AppText>
      </View>
      <View style={styles.itemsCard}>
        {receipt.lineItems.map((item, index) => {
          const on = !excluded.has(item.id);
          const credit = item.flow === 'credit';
          const amountText = money(
            credit ? -item.amountCents : item.amountCents,
          );
          return (
            <PressableScale
              key={item.id}
              onPress={() => onToggle(item)}
              scaleTo={0.99}
              accessibilityRole="checkbox"
              accessibilityState={{checked: on}}
              accessibilityLabel={`${item.description}, ${amountText}${
                credit ? ', returned or discounted' : ''
              }`}
              style={[styles.itemRow, index > 0 && styles.itemDivider]}>
              {on ? (
                <CheckCircle size={20} color={colors.lavender} weight="fill" />
              ) : (
                <CircleIcon size={20} color={colors.muted} weight="regular" />
              )}
              <View style={styles.flex}>
                <AppText
                  variant="body"
                  color={on ? colors.text : colors.muted}
                  numberOfLines={2}
                  style={on ? null : styles.struck}>
                  {item.description}
                </AppText>
                {item.quantity !== null && item.unitCents !== null ? (
                  <AppText variant="caption" color={colors.muted}>
                    {item.quantity} × {money(item.unitCents)}
                  </AppText>
                ) : null}
              </View>
              <AppText
                variant="bodyStrong"
                color={!on ? colors.muted : credit ? colors.mint : colors.text}
                style={on ? null : styles.struck}>
                {amountText}
              </AppText>
            </PressableScale>
          );
        })}

        <View style={[styles.totalLine, styles.itemDivider]}>
          <AppText variant="caption" color={colors.muted} style={styles.flex}>
            Items
          </AppText>
          <AppText variant="caption" color={colors.text}>
            {money(net)}
          </AppText>
        </View>
        {receipt.adjustments.map((adjustment, index) => (
          <View key={`${adjustment.label}-${index}`} style={styles.totalLine}>
            <AppText
              variant="caption"
              color={colors.muted}
              numberOfLines={1}
              style={styles.flex}>
              {adjustment.label}
            </AppText>
            <AppText variant="caption" color={colors.text}>
              {money(adjustment.cents)}
            </AppText>
          </View>
        ))}
        {receipt.totalCents !== null ? (
          <View style={styles.totalLine}>
            <AppText variant="label" color={colors.text} style={styles.flex}>
              Printed total
            </AppText>
            <AppText variant="label" color={colors.text}>
              {money(receipt.totalCents)}
            </AppText>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  readingThumb: {
    width: 120,
    height: 160,
    borderRadius: radii.tile,
    borderWidth: 1,
    borderColor: colors.line,
    opacity: 0.7,
  },
  errorTitle: {
    marginTop: spacing.sm,
  },
  errorActions: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_WIDTH * 1.3,
    borderRadius: radii.iconSquare,
    backgroundColor: colors.surfaceRaised,
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  dupCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: withAlpha(colors.gold, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.35),
  },
  dupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kindControl: {
    marginTop: spacing.xl,
  },
  kindHint: {
    marginTop: spacing.sm,
  },
  amountRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  amountDigits: {
    flex: 1,
    padding: 0,
    margin: 0,
    minHeight: 54,
    ...typography.numericHero,
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  checkRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  field: {
    marginTop: spacing.lg,
  },
  dateRow: {
    marginTop: spacing.md,
    minHeight: layout.controlHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dateCopy: {
    flex: 1,
  },
  sectionTitle: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionHead: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  categoryRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  categoryChipOn: {
    borderColor: colors.lavender,
    backgroundColor: colors.surfaceRaised,
  },
  itemsCard: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  totalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  rawToggle: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rawBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rawLine: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  dock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.ground,
  },
  dockFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -24,
    height: 24,
  },
});
