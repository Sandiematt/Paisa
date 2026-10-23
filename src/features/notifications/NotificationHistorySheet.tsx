import React from 'react';
import {StyleSheet, View} from 'react-native';

import {BellGlyph} from '../../components/icons/Glyphs';
import {AppText, PressableScale} from '../../components/ui';
import {NotificationItem} from '../../lib/notifications/types';
import {colors, radii, spacing} from '../../theme';
import {SheetFrame} from '../profile/ProfileSheets';
import {useNotifications} from './NotificationsProvider';

type NotificationHistorySheetProps = {
  visible: boolean;
  onClose: () => void;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now = Date.now()): string {
  const stamp = new Date(iso).getTime();
  if (Number.isNaN(stamp)) {
    return '';
  }
  const age = Math.max(0, now - stamp);
  if (age < MINUTE) {
    return 'Just now';
  }
  if (age < HOUR) {
    return `${Math.floor(age / MINUTE)}m ago`;
  }
  if (age < DAY) {
    return `${Math.floor(age / HOUR)}h ago`;
  }
  if (age < 7 * DAY) {
    return `${Math.floor(age / DAY)}d ago`;
  }
  return new Date(stamp).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function Row({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  return (
    <PressableScale
      onPress={() => onPress(item)}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
      style={[styles.row, !item.read && styles.rowUnread]}>
      <View style={styles.dotSlot}>
        {item.read ? null : <View style={styles.dot} />}
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <AppText
            variant="bodyStrong"
            numberOfLines={1}
            style={styles.title}>
            {item.title}
          </AppText>
          <AppText variant="caption" color={colors.inkMuted}>
            {relativeTime(item.createdAt)}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.inkSecondary}>
          {item.body}
        </AppText>
      </View>
    </PressableScale>
  );
}

export function NotificationHistorySheet({
  visible,
  onClose,
}: NotificationHistorySheetProps) {
  const {items, unreadCount, markAllRead, openItem} = useNotifications();

  const markAll = (
    <PressableScale
      onPress={markAllRead}
      disabled={unreadCount === 0}
      scaleTo={0.94}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mark all notifications as read"
      accessibilityState={{disabled: unreadCount === 0}}
      style={styles.markAll}>
      <AppText
        variant="label"
        color={unreadCount === 0 ? colors.inkMuted : colors.gold}>
        Mark all read
      </AppText>
    </PressableScale>
  );

  return (
    <SheetFrame
      visible={visible}
      title="Notifications"
      onClose={onClose}
      trailing={markAll}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyBadge}>
            <BellGlyph color={colors.inkMuted} size={22} />
          </View>
          <AppText variant="bodyStrong">Nothing yet</AppText>
          <AppText
            variant="caption"
            color={colors.inkMuted}
            align="center"
            style={styles.emptyText}>
            Budget alerts and expense reminders will show up here.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map(item => (
            <Row
              key={item.id}
              item={item}
              onPress={next => {
                openItem(next);
                onClose();
              }}
            />
          ))}
        </View>
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  rowUnread: {
    borderColor: colors.accent,
  },
  dotSlot: {
    width: 10,
    paddingTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  markAll: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.sm,
  },
  emptyBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.canvasSunk,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyText: {
    maxWidth: 260,
  },
});
