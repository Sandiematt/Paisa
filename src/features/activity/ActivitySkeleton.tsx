import React from 'react';

import {Card, LoadingState} from '../../components/ui';
import {makeStyles, radii} from '../../theme';

/**
 * Shown in place of a ledger section while its first load is in flight. The
 * name and `rows` are kept so existing call sites do not change; the app's
 * loading animation replaces the placeholder rows.
 */
export function ActivitySkeleton({
  rows = 4,
  label = 'Loading activity',
}: {
  rows?: number;
  label?: string;
}) {
  const styles = useStyles();
  return (
    <Card padding={0} radius={radii.card} style={styles.card}>
      <LoadingState label={label} size={rows <= 3 ? 80 : 96} />
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  card: {
    overflow: 'hidden',
  },
}));
