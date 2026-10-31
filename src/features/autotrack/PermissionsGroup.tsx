import React from 'react';
import {BellRinging} from 'phosphor-react-native/src/icons/BellRinging';
import {PersonSimpleCircle} from 'phosphor-react-native/src/icons/PersonSimpleCircle';

import {AppText, SettingsGroup, SettingsRow} from '../../components/ui';
import {
  openAccessibilitySettings,
  openNotificationAccessSettings,
} from '../../lib/autotrack/nativeUpiDetector';
import {DetectorStatus} from '../../lib/autotrack/types';
import {colors} from '../../theme';

const ICON_SIZE = 24;

function PermissionState({on}: {on: boolean}) {
  return (
    <AppText variant="bodyStrong" color={on ? colors.mint : colors.lavender}>
      {on ? 'On' : 'Enable'}
    </AppText>
  );
}

/**
 * The two system permissions auto-tracking needs. Both are granted in system
 * settings, so the caller re-reads status when the app comes back.
 */
export function PermissionsGroup({status}: {status: DetectorStatus | null}) {
  const accessibilityOn = status?.accessibilityEnabled === true;
  const notificationsOn = status?.notificationAccessEnabled === true;
  return (
    <SettingsGroup>
      <SettingsRow
        icon={<PersonSimpleCircle size={ICON_SIZE} color={colors.text} />}
        label="Accessibility service"
        trailing={<PermissionState on={accessibilityOn} />}
        onPress={() => {
          openAccessibilitySettings();
        }}
        accessibilityLabel={`Accessibility service, ${accessibilityOn ? 'on' : 'off'}`}
        accessibilityHint="Opens system settings"
      />
      <SettingsRow
        icon={<BellRinging size={ICON_SIZE} color={colors.text} />}
        label="Notification access"
        trailing={<PermissionState on={notificationsOn} />}
        onPress={() => {
          openNotificationAccessSettings();
        }}
        accessibilityLabel={`Notification access, ${notificationsOn ? 'on' : 'off'}`}
        accessibilityHint="Opens system settings"
      />
    </SettingsGroup>
  );
}
