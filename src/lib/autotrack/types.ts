// Shared contract between the native UPI detector (Kotlin, android/app/src/main/java/io/yestack/upidetector)
// and the JS side. The bridge module is `NativeModules.UpiDetector`; every object crosses the bridge as a
// JSON string (methods resolve `string`, the JS wrapper parses it) so the Kotlin side only needs org.json.
//
// Kotlin JSON field list (keep in sync):
//   DetectedTxn      {id: Long, sourceApp: String, amount: String (BigDecimal plain), status: "SUCCESS"|"FAILED"|"PENDING",
//                     direction: "DEBIT"|"CREDIT"|"UNKNOWN", merchant: String?, upiRef: String?, detectedAtMillis: Long,
//                     updatedAtMillis: Long, flag: "POSSIBLE_DUPLICATE"?, flagReason: String?, possibleDuplicateOfId: Long?,
//                     note: String?, synced: Boolean, dirty: Boolean, remoteId: String?, syncedAtMillis: Long?}
//   DetectorStatus   {accessibilityEnabled, notificationAccessEnabled: Boolean, installedApps: [String package names]}
//   PendingTxn       DetectedTxn + {externalRef: String ("upi:<installId>:<epoch>:<id>"), alreadySynced: Boolean}
//   AckEntry         {id: Long, remoteId: String?}
//   AutoTrackPrefs   {notesEnabled, blockingEnabled: Boolean}
//   BudgetSnapshot   {monthKey: "YYYY-MM", monthlyBudget: Number, spendByDate: {"YYYY-MM-DD": Number},
//                     dataAsOfMillis: Long, cycleStartDay: Int (optional, default 1)}
//
// Ownership: native tags every detection with the owner set by setOwner(userId). getTransactions / getPending and the
// unsynced spend only ever cover the current owner's rows. Detections made while signed out belong to the last owner.
// Bridge methods (args): setOwner(userId: String?), clearUserData(purgeHistory: Boolean), setLogStreaming(enabled).
//
// Spend counting rule (native BudgetPlan extras, JS unsyncedSpendByDate, sync): only direction DEBIT is an expense.
// A detection counts as extra spend when SUCCESS + DEBIT + unflagged and (not synced, or syncedAtMillis >
// snapshot.dataAsOfMillis — the Paisa ledger behind the snapshot was read before it was saved). UNKNOWN direction is
// never synced; CREDIT syncs as income.
//   Allowance        see DailyAllowance below (null when no budget)
//   Event            "UpiDetectorChanged" with payload {reason: "transactions"|"log"|"status"}

export type DetectorTxnStatus = 'SUCCESS' | 'FAILED' | 'PENDING';
export type DetectorDirection = 'DEBIT' | 'CREDIT' | 'UNKNOWN';

/** One record from the native detector's local store (ExpenseDb). */
export type DetectedTxn = {
  id: number;
  /** Package name of the UPI app, e.g. com.phonepe.app. */
  sourceApp: string;
  /** BigDecimal as a plain string, e.g. "149.50". */
  amount: string;
  status: DetectorTxnStatus;
  direction: DetectorDirection;
  merchant: string | null;
  upiRef: string | null;
  detectedAtMillis: number;
  updatedAtMillis: number;
  flag: 'POSSIBLE_DUPLICATE' | null;
  flagReason: string | null;
  possibleDuplicateOfId: number | null;
  note: string | null;
  /** Saved to Supabase at least once. */
  synced: boolean;
  /** Changed locally since the last successful sync (e.g. a note added after the payment). */
  dirty: boolean;
  /** Supabase transactions.id once synced. */
  remoteId: string | null;
  /** When the last successful sync was acknowledged; null when never synced. */
  syncedAtMillis: number | null;
};

/** A record the JS side should push to Supabase: SUCCESS, unflagged, and dirty. */
export type PendingTxn = DetectedTxn & {
  /** Stable Supabase dedupe key: "upi:<installId>:<id>". */
  externalRef: string;
  /** True when only a later change (note) needs sending; the row already exists remotely. */
  alreadySynced: boolean;
};

export type AckEntry = {id: number; remoteId: string | null};

export type DetectorStatus = {
  accessibilityEnabled: boolean;
  notificationAccessEnabled: boolean;
  /** Supported UPI apps installed on this phone (package names). */
  installedApps: string[];
};

export type AutoTrackPrefs = {
  /** Ask for a note after each detected payment. */
  notesEnabled: boolean;
  /** Warn on the UPI Pay screen when a payment would exceed today's allowance. */
  blockingEnabled: boolean;
};

export const DEFAULT_AUTO_TRACK_PREFS: AutoTrackPrefs = {
  notesEnabled: true,
  blockingEnabled: true,
};

/** What JS knows about spending, pushed to native so the spend guard works while the app is closed. */
export type BudgetSnapshot = {
  /** Month the budget cycle starts in, "YYYY-MM" (the calendar month when cycleStartDay is 1). */
  monthKey: string;
  /** Budget left for day-to-day spending: profiles.monthly_budget minus this cycle's monthly bills. 0 means no budget (guard off). */
  monthlyBudget: number;
  /** Day-to-day expense spend per local day of the cycle, from Paisa rows (manual + already-synced auto); bills left out. */
  spendByDate: Record<string, number>;
  /** When the Paisa ledger behind spendByDate was read (fetch start). Rows synced after this are not in it yet. */
  dataAsOfMillis: number;
  /** Payday the cycle starts on, 1-31 (31 = last day). Absent means 1: calendar months. */
  cycleStartDay?: number;
};

/** Adaptive-via-week daily allowance (see src/features/autotrack/dailyAllowance.ts). */
export type DailyAllowance = {
  /** Today's local date, "YYYY-MM-DD". */
  date: string;
  /** Monday of this week, clipped to the 1st of the month. */
  weekStart: string;
  /** Sunday of this week, clipped to the last day of the month. */
  weekEnd: string;
  weekBudget: number;
  spentWeekBeforeToday: number;
  /** Days left in the (clipped) week, including today. */
  daysLeftInWeek: number;
  dailyLimit: number;
  spentToday: number;
  /** dailyLimit - spentToday; negative when over. */
  remainingToday: number;
  /** weekBudget - spent this week including today; negative when over. */
  remainingWeek: number;
};

export type DetectorChangeReason = 'transactions' | 'log' | 'status';

export const UPI_DETECTOR_EVENT = 'UpiDetectorChanged';

/** Display names for supported UPI apps; also used as transactions.payment_method. */
export const UPI_APP_NAMES: Record<string, string> = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
};
