import {NotificationItem} from './types';

export const HISTORY_LIMIT = 100;

function newestFirst(a: NotificationItem, b: NotificationItem): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return a.id < b.id ? 1 : -1;
}

/** Adds an item unless one with the same id exists; newest first, capped. */
export function addToHistory(
  items: readonly NotificationItem[],
  item: NotificationItem,
): NotificationItem[] {
  if (items.some(existing => existing.id === item.id)) {
    return items as NotificationItem[];
  }
  return [...items, item].sort(newestFirst).slice(0, HISTORY_LIMIT);
}

export function markItemRead(
  items: readonly NotificationItem[],
  id: string,
): NotificationItem[] {
  if (!items.some(item => item.id === id && !item.read)) {
    return items as NotificationItem[];
  }
  return items.map(item => (item.id === id ? {...item, read: true} : item));
}

export function markAllItemsRead(
  items: readonly NotificationItem[],
): NotificationItem[] {
  if (items.every(item => item.read)) {
    return items as NotificationItem[];
  }
  return items.map(item => (item.read ? item : {...item, read: true}));
}

export function unreadCountOf(items: readonly NotificationItem[]): number {
  return items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}
