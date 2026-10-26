import {AckEntry, PendingTxn} from '../../lib/autotrack/types';

export type DrainResult = {
  /** Detections saved (or already there) and acknowledged to native. */
  acked: number;
  /** Detections that failed to save; they stay pending for the next drain. */
  failed: number;
  /** True when the drain did nothing because auto-tracking is off or signed out. */
  skipped: boolean;
};

export type DrainDeps = {
  /**
   * False while unsupported, signed out, or before native knows the owner;
   * the drain then does nothing. Checked again before acknowledging, so a
   * drain that outlives a user switch never acks for the new user.
   */
  enabled: () => boolean;
  getPending: () => Promise<PendingTxn[]>;
  /** Resolves the remote id (or null if there is none); rejects to retry later. */
  save: (pending: PendingTxn) => Promise<string | null>;
  ack: (entries: AckEntry[]) => Promise<boolean>;
  onRunningChange?: (running: boolean) => void;
};

const SKIPPED: DrainResult = {acked: 0, failed: 0, skipped: true};

/**
 * Pushes native detections to Supabase, one drain at a time. A trigger that
 * arrives mid-drain does not start a second one; it makes the running drain go
 * round once more so nothing detected meanwhile waits for the next trigger.
 * Only rows that saved are acknowledged, and nothing here ever throws.
 */
export function createSyncDrain(deps: DrainDeps) {
  let running: Promise<DrainResult> | null = null;
  let again = false;

  async function pass(): Promise<DrainResult> {
    if (!deps.enabled()) {
      return SKIPPED;
    }
    const pending = await deps.getPending();
    const entries: AckEntry[] = [];
    let failed = 0;
    for (const item of pending) {
      if (!deps.enabled()) {
        break;
      }
      // Never uploaded, so never acknowledged either.
      if (item.direction === 'UNKNOWN') {
        continue;
      }
      try {
        entries.push({id: item.id, remoteId: await deps.save(item)});
      } catch (caught) {
        failed += 1;
        if (failed === 1) {
          console.warn(
            'Auto-tracking sync failed:',
            caught instanceof Error ? caught.message : caught,
          );
        }
      }
    }
    // The owner may have changed while saving; those rows are not this
    // owner's to acknowledge and will simply be pending again for them.
    if (entries.length > 0 && !deps.enabled()) {
      return {acked: 0, failed, skipped: true};
    }
    const acked = entries.length > 0 && (await deps.ack(entries));
    return {
      acked: acked ? entries.length : 0,
      failed: failed + (acked || entries.length === 0 ? 0 : entries.length),
      skipped: false,
    };
  }

  async function loop(): Promise<DrainResult> {
    const total: DrainResult = {acked: 0, failed: 0, skipped: true};
    do {
      again = false;
      try {
        const result = await pass();
        total.acked += result.acked;
        total.failed = result.failed;
        total.skipped = total.skipped && result.skipped;
      } catch {
        total.failed += 1;
        total.skipped = false;
      }
    } while (again);
    return total;
  }

  return {
    run(): Promise<DrainResult> {
      if (running) {
        again = true;
        return running;
      }
      deps.onRunningChange?.(true);
      running = loop().finally(() => {
        running = null;
        deps.onRunningChange?.(false);
      });
      return running;
    },
  };
}
