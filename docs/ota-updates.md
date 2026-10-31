# Over-the-air updates (EAS Update)

Paisa ships JavaScript and asset changes over the air with `expo-updates` and
EAS Update. Anything that touches native code (a new native module, a config
plugin, `android/` or `ios/` edits, an Expo SDK bump) still needs a new store or
internal build.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| `runtimeVersion: {"policy": "fingerprint"}` | `app.json` | The runtime version is a hash of the native project. An update only reaches builds with the same hash, so a JS update can never land on a binary with different native code. |
| `updates.checkAutomatically: "ON_ERROR_RECOVERY"`, `fallbackToCacheTimeout: 0` | `app.json`, `AndroidManifest.xml`, `ios/expense_tracker/Supporting/Expo.plist` | Launch never waits on the network. The native layer only checks on its own after a crashed launch (so a bad update can be replaced); normal checks are done by the app. |
| Build profiles and channels | `eas.json` | `development`, `preview` and `production` builds each point at the channel of the same name. |
| `useOtaUpdate` | `src/features/updates/useOtaUpdate.ts` | Checks on launch and when the app returns to the foreground (at most every 4 hours), downloads in the background, never reloads by itself. |
| `runUpdateCheck` | `src/lib/updates/otaUpdate.ts` | The check-then-download pass, with 10 s / 90 s timeouts. Offline, server errors, timeouts and download failures are logged (dev only) and treated as "no update". |
| `UpdateBanner` | `src/features/updates/UpdateBanner.tsx` | Pill under the status bar: "Downloading update" while it downloads, then "Update ready" with **Restart**. Closing it is fine: a downloaded update is applied on the next cold start anyway. Hidden behind the launch splash; the biometric lock modal sits above it. |

Nothing runs in development (`__DEV__`) or when `Updates.isEnabled` is false,
which covers Metro / dev-client debug sessions and Jest.

A restart reloads the JS bundle only. Auth sessions, the saved theme
(`paisa.colorScheme`), the local ledger and everything else in AsyncStorage or
native storage survive it, exactly as they survive a cold start.

## One-time setup

Run these yourself; they need your Expo account.

```bash
npm install -g eas-cli
eas login
npm run eas:configure
```

`eas:configure` runs `eas init` (creates the EAS project and writes
`extra.eas.projectId` and `owner` into `app.json`) and then
`eas update:configure`, which writes `updates.url`
(`https://u.expo.dev/<projectId>`) into `app.json` and syncs it into
`android/app/src/main/AndroidManifest.xml` (`expo.modules.updates.EXPO_UPDATE_URL`)
and `ios/expense_tracker/Supporting/Expo.plist` (`EXUpdatesURL`). Commit those
changes.

If `eas update:configure` asks about the runtime version policy, keep
`fingerprint`.

Then install an update-capable binary. Builds made before this change don't
contain `expo-updates` and will never receive an update.

```bash
npm run build:development
npm run build:preview
npm run build:production
```

| Profile | Channel | Use |
| --- | --- | --- |
| `development` | `development` | Dev-client build for day-to-day work. Updates are loaded from the dev launcher's "Extensions" tab, not by the banner. |
| `preview` | `preview` | Internal release build (Android APK) for testers. The banner flow runs here. |
| `production` | `production` | Store build. `autoIncrement` bumps the build number; versions are kept remotely (`appVersionSource: remote`). |

EAS installs with `NPM_CONFIG_LEGACY_PEER_DEPS=true` because of the existing
`@react-native-community/datetimepicker` peer conflict.

## Publishing an update

Make the JS change, run the tests, then publish to a channel:

```bash
npm run update:preview -- --message "Fix budget rounding"
npm run update:production -- --message "Fix budget rounding"
```

These run `eas update --channel <name>`, which bundles the app for both
platforms and uploads it. Users on a matching build get it on their next launch
or foreground: it downloads in the background, the banner offers a restart,
and it is applied at the latest on the next cold start.

Good practice: publish to `preview`, check it on a preview build, then
publish the same commit to `production`. To promote the exact same bundle
instead of rebuilding it:

```bash
eas update:republish --group <update-group-id> --destination-channel production
```

### When a new build is needed instead

The fingerprint changes whenever native code or native config changes, and an
update published from such a commit will not reach existing builds (EAS warns
that no build matches its runtime version). Make a new build in that case.

To see what the current runtime version is, or why two commits differ:

```bash
npm run update:runtime -- --platform android
eas fingerprint:compare
```

## Rolling back

Pick whichever fits:

```bash
# Interactive: go back to a previous update, or to the bundle embedded in the build.
npm run update:rollback

# Re-publish a known good update group as the newest update on a channel.
eas update:republish --group <good-update-group-id>

# Tell clients on a channel to go back to the JS embedded in their binary.
eas update:roll-back-to-embedded --channel production --runtime-version <runtime-version>
```

Find group ids with `eas update:list --branch production`. A rollback is
delivered like any other update: the banner shows "Update ready" and the
rollback applies on restart or the next cold start.

If a published update crashes on launch, expo-updates' error recovery rolls
the device back to the last update that launched successfully on its own; the
rollback above then stops new installs from picking up the broken update.

## Testing the flow locally

`expo start` sessions never check for updates. To exercise the banner:

1. `npm run build:preview` and install it.
2. Change some visible text, then `npm run update:preview -- --message "banner test"`.
3. Open the app, send it to the background and back, or cold start it. The
   "Downloading update" pill appears, then "Update ready". Tap **Restart**.

The logic is covered by `__tests__/otaUpdate.test.tsx`; `jest.setup.js` mocks
`expo-updates` as disabled.
