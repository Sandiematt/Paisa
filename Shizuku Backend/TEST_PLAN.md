# UPI Detector — real-phone test plan

Goal: find out whether Google Pay, PhonePe and Paytm payment-result screens expose their amount, status, merchant and UPI reference reliably in `uiautomator dump` (run as the shell user through Shizuku, no root), and whether the detector records each payment exactly once.

**Nothing has been verified on a real phone yet.** The JVM unit tests prove the parser and duplicate rules against screens (some transcribed from a real phone, replayed as dump XML), not against real dumps of each app. This plan is how that changes.

> Transactions, notes and the daily limit are saved on the phone. The live log and raw captures are memory only: force-stopping the app or rebooting erases them. **Tap Share report before either.**

## 1. Build the APK

From the `UPIDetector` folder:

```bash
./gradlew :app:assembleDebug
```

(On Windows `cmd`/PowerShell use `gradlew.bat :app:assembleDebug`.) The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

To run the unit tests:

```bash
./gradlew testDebugUnitTest
```

Android Studio: open the `UPIDetector` folder, let Gradle sync, choose the `app` run configuration and your phone, then Run.

## 2. Install

With USB debugging on and the phone connected:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the phone and open it (allow "Install unknown apps" for your file manager when asked).

## 3. Set up Shizuku and start capture

UPI Detector reads the UPI apps' screens by running `uiautomator dump` and `dumpsys` as the shell user (what `adb shell` runs as). [Shizuku](https://shizuku.rikka.app/) gives it that access without root, and without a PC once Shizuku is running.

1. **Install Shizuku** from the Play Store (or its GitHub releases).
2. **Start Shizuku.** Open Shizuku and use one of:
   - **Wireless debugging (Android 11+, no PC):** Settings → About phone → tap *Build number* 7 times to turn on Developer options. Developer options → turn on **Wireless debugging**. In Shizuku tap **Pairing**, then in Wireless debugging tap **Pair device with pairing code** and enter the code in Shizuku's notification. Then tap **Start** in Shizuku.
   - **From a PC:** turn on **USB debugging**, connect the phone, and run the command Shizuku shows under *Start via connected computer*:

     ```bash
     adb shell sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh
     ```

   Shizuku should then say **Shizuku is running**. Without root, **Shizuku stops on every reboot**: start it again the same way.
3. Open **UPI Detector**. The top card shows the capture state and lists which of GPay / PhonePe / Paytm are installed:
   - *Shizuku is not running* → go back to step 2.
   - *Shizuku is running, but UPI Detector has not been allowed to use it* → tap **Grant Shizuku permission** → **Allow** in Shizuku's dialog.
4. Tap **Start capture** (allow notifications if asked). The card turns to **Capture: ON (via Shizuku)**, a "UPI Detector is reading UPI app screens" notification stays up, and the Live log shows:
   - `capture service started; ignoring payments dated before install …`
   - `capture started (via Shizuku)`
   - `overlay permission granted through Shizuku (daily-limit warning and note pop-up)`. UPI Detector grants itself "display over other apps" through Shizuku, so there is nothing to toggle in Settings. If this line says *not granted*, notes open in a separate screen: send the report. The daily-limit warning does not need it: it opens as a screen of its own over the Pay screen (GPay hides other apps' pop-ups there), and Cancel or back returns to the Pay screen as it was.
5. **Check it reads:** open Google Pay. Within a couple of seconds the log shows `Session #N started on com.google.android.apps.nbu.paisa.user/…` and `read Google Pay …: 1 window(s): …`.
6. **Notification access (cross-check):** tap **Open notification access settings** → UPI Detector → allow. If it is greyed out (Android 13+ blocks it for sideloaded apps): Settings → Apps → UPI Detector → ⋮ (top right) → **Allow restricted settings**, then try again. The card should then say *Notification access: on* and the log shows `listener connected`. It reads only GPay, PhonePe, Paytm and SMS-app notifications, keeps only amount + UPI ref + direction, and never creates a transaction by itself.

Capture keeps running until you tap **Stop capture** (on the card or in the notification). If Android kills it, or Shizuku stops (a reboot), start Shizuku again and open UPI Detector: capture restarts by itself.

Some phones (Xiaomi, Oppo, Vivo, Samsung) kill background services aggressively. If capture keeps stopping, set battery usage for UPI Detector **and Shizuku** to *Unrestricted*.

The first read of a UPI app logs `capture mode: in-process screen reading (dumped in process in N ms)`: the screen is read through one UiAutomation connection kept open in the Shizuku process, in milliseconds, and other accessibility services (TalkBack, autofill helpers) keep running. If it says `capture mode: uiautomator dump, ~2 s per read (…)` instead, the fast path could not be opened on this phone: capture still works, but slower (warnings and the note pop-up can come late), and each dump briefly suspends other accessibility services. Send the report.

## 4. How to read the live log

Each line is `HH:mm:ss <message>`. The lines you will see:

| Line | Meaning |
|---|---|
| `Session #N started on <pkg>/<ScreenClass>` | A new screen of a supported app opened. `(no screen class, using window-ID fallback)` means Android gave no class name. |
| `Session #N ended on … (app went to background)` | You left the app. |
| `read <App> <ScreenClass>: N window(s): [used] M nodes …` | A dump of the app was read; each window is parsed on its own and one decides. |
| `empty read of <ScreenClass>: no dump: ERROR: could not get idle state. (the screen kept animating for 10 s)` | uiautomator could not dump: the screen never stopped animating. Logged up to 5 times per screen, then `gave up`; dumping continues. |
| `empty read of …: no window of <App> in the dump` / `no text in its windows` | The app's Activity is in front but its windows were covered (notification shade, another app's dialog) or had no text yet. |
| `… screen changed during the dump (…); dump discarded` | You moved to another screen while it was dumping; that dump is not used. Normal while navigating. |
| `skipped PIN-entry screen (not dumped)` | The UPI PIN screen is never dumped; it marks a payment as started. |
| `<App> no longer in front (now in front: <pkg>); stopped dumping it` | You left the app (home screen, another app, UPI Detector). |
| `Rejected (REASON): detail` | Screen read but not saved: `NO_STATUS_PHRASE`, `NO_AMOUNT`, `AMBIGUOUS_AMOUNT`, `CONFLICTING_STATUS`, `EMPTY_SNAPSHOT`, `BEFORE_INSTALL` (the screen's payment date is earlier than when UPI Detector was installed — an old payment being viewed). |
| `Inserted record #N: <amount> <STATUS> at <merchant> …` | A new transaction. |
| `Updated record #N (…): PENDING -> SUCCESS` | A pending payment reached its final status. |
| `Ignored duplicate (UPI_REF / SCREEN_SESSION): …` | A repeat of an existing record; nothing added. (The 60 s rule never silently ignores: it either upgrades a PENDING record or flags.) |
| `Flagged POSSIBLE_DUPLICATE of record #N (…): …` | Possibly a second real payment; needs your Keep / Merge. |
| `UPI reference label found but no valid 12-digit value: …` | A reference label was on screen but its value didn't parse. |
| `notification <App/Messages>: ₹A DEBIT ref R` | A UPI-app or bank-SMS notification with an amount and a 12-digit UPI ref. |
| `Notification ₹A ref R: attached UPI ref R from <src> to record #N` | The notification gave the screen-detected record its UPI ref. |
| `… carries a different ref, so it is a separate payment — cleared POSSIBLE_DUPLICATE` | A second bank SMS with a different ref proved a flagged row is a real second payment. |
| `Notification from <src> confirms record #N: UPI ref R already attached` | Same payment notified twice (app + SMS) — nothing changes. |
| `… no matching screen record yet; waiting up to 5 min` / `… never matched a screen detection — possible missed screen` | The notification arrived but the screen reader did not record that payment: send the report. |
| `ERROR in …` | A bug in the parser/detector — always send the report. |

Note: every read of a payment screen logs a decision line, so a screen left open produces repeated `Ignored duplicate` lines — that is expected.

**How capture works, and its limits:**
- **Screen-change events.** A screen change in GPay, PhonePe or Paytm wakes capture; it reads about 0.2–0.4 s later (and at least once a second while a UPI app is in front). Which Activity is in front comes from `dumpsys activity`; nothing is read while another app is in front. In the slow fallback (`uiautomator dump`) a read takes 1–3 s, and a screen shown for less than that can be missed.
- **Animated screens.** Only in the slow fallback: if a screen keeps animating for 10 s, uiautomator cannot dump it (`could not get idle state`). The in-process reader does not wait for an idle screen.
- **Only visible nodes.** The dump leaves out anything scrolled off screen or hidden. A "Done" button below an ad is not in the dump until it is on screen.
- **Sessions follow the Activity.** A new Activity in front starts a session; leaving to the home screen or any other app ends it. Dialogs and sheets keep their Activity, so they stay in its session.
- **Screen off:** nothing is dumped until it is back on.

## 5. Test cases

Use **₹1** payments to someone you know (or yourself on a second UPI ID). Before each case: tap **Clear**. After each case: open the Transactions, Live log and Raw tabs, note the result in the table at the end, and tap **Share report** whenever the result doesn't match what's expected.

### TC1 — GPay success
1. Pay ₹1 in Google Pay and wait on the success screen for 5 seconds.
2. Switch to UPI Detector.

GPay's success screen has no "successful" text — just `₹1` / `Paid to` / name / `Share screenshot` / `See details`. The parser treats *an amount node directly followed by "Paid to"* as success **only** when one of those success-screen controls is on screen.

Expected: exactly **one** row: Google Pay · ₹1.00 · SUCCESS · DEBIT · payee name · 12-digit UPI ref (if GPay showed "UPI transaction ID"). Expense total ₹1.00. Log: `Session … started`, `read Google Pay …: 1 window(s): [used] N nodes candidate ₹1.00 SUCCESS DEBIT` with N > 0, `Inserted record #1: 1.00 SUCCESS at <payee> …`, then a `Session … ended … (app went to background)`.

### TC2 — PhonePe success
Same as TC1 in PhonePe. Expected: one PhonePe SUCCESS row; ref from "UTR" if shown. PhonePe's own "Transaction ID T…" must **not** appear as the ref.

PhonePe draws its processing and result screens in a window of their own above the chat. Expected log: `skipped PIN-entry screen (not dumped)`, then `read PhonePe …: 2 window(s): [used] … candidate ₹… PENDING` or `SUCCESS` for the result window and `rejected NO_STATUS_PHRASE` for the chat, then `Inserted record` (or `Updated record … PENDING -> SUCCESS`), and the note prompt. In the Raw tab each window is its own capture, with a line such as `window 123, layer 2 of 4, app, active, root …, N nodes in dump`. If no record appears, share the report: the raw captures from that minute show every window that was read, and every failed read with the window list it saw. If the log shows `could not get idle state` on the result screen, note that in the results: the ad kept it from being dumped.

### TC3 — Paytm success
Same as TC1 in Paytm. Expected: one Paytm SUCCESS row; ref from "UPI Ref No" if shown. Paytm's "Order ID" must **not** appear as the ref.

### TC4 — Failed payment
In any app, start a ₹1 payment and enter a **wrong UPI PIN** (once only, to avoid a PIN lock).

Expected: one row with status **FAILED**, not counted in the expense total. Log: `Inserted record #N: 1.00 FAILED …`.

### TC5 — Pending / processing
Hard to trigger on purpose; note it if you see a "processing"/"pending" screen (e.g. on a weak network).

Expected: a PENDING row that becomes SUCCESS or FAILED when the final screen shows. Log: `Inserted … PENDING`, then `Updated record #N (…): PENDING -> SUCCESS`. Never two rows for one payment.

### TC6 — Success screen left open (no duplicates)
After a success, leave the success screen open for **2 minutes**, scroll it, rotate the phone if the app allows.

Expected: still exactly one row. Log may show `Ignored duplicate (SCREEN_SESSION): …` lines; no new `Inserted`.

### TC7 — Re-opening the same transaction
After TC1, open the payment again from the app's history / transaction details screen.

Expected: no new counted row. Either `Ignored duplicate (UPI_REF)` (if the ref is shown on both screens), `Ignored duplicate (SCREEN_SESSION)`, or a `Flagged POSSIBLE_DUPLICATE` row that you then **Merge**. Report which one happened.

### TC8 — Two genuine payments of the same amount
Pay ₹1 to the same person twice within a minute in the same app.

Expected: two rows. If both screens showed a UPI ref: two normal rows. If refs were missing: the second one is **POSSIBLE_DUPLICATE** — tap **Keep** and check the total becomes ₹2.00.

### TC9 — History / passbook screen (no false detection)
Open each app's transaction history list (rows like "Paid to Ravi ₹50") and scroll.

Expected: **no new rows**. Log shows `Rejected (NO_STATUS_PHRASE)`, `Rejected (AMBIGUOUS_AMOUNT)` or `Rejected (BEFORE_INSTALL)`. Any row created here is a false positive — send the report.

### TC9b — Old payments in chat / transaction details
Open a payment made **before** you installed UPI Detector: PhonePe chat with a contact (payment bubbles), GPay → transaction → details, PhonePe → History → a transaction.

Expected: no row; log shows `Rejected (BEFORE_INSTALL): <amount> SUCCESS dated '<date on screen>', before the app was installed`. The install time is printed in the `capture service started; ignoring payments dated before install …` line. A screen that shows no date can't be judged this way — note which ones those are.

### TC10 — Home screen / balance check
Open each app's home screen and, if available, a balance check.

Expected: no rows; rejections in the log.

### TC11 — Non-English UI
Switch one app to Hindi (app language setting) and make a ₹1 payment.

Expected: **no row** (English only in v1), log shows `Rejected (NO_STATUS_PHRASE)`. The Raw tab should still show the Hindi text — send that report so Hindi phrases can be added later.

### TC12 — Received money
Have someone send you ₹1 and open the credit screen in the app.

Expected: if detected, direction **CREDIT** and **not** in the expense total.

### TC13 — Keep / Merge
On any POSSIBLE_DUPLICATE row (from TC7/TC8):
- **Keep** → badge disappears, row counts toward the total if it is SUCCESS + DEBIT.
- **Merge** → confirm → row disappears.
Log: `user keep #N: done` / `user merge #N: done`.

### TC14 — Raw capture switch
Untick **Capture raw screen text**, open a payment screen → the Raw tab gets no new entries. Tick it again → captures resume. Detection still works while it is off.

### TC15 — Clear and restart
Tap **Clear** → transactions, log and raw captures are empty. Make a ₹1 payment, then force-stop the app from system settings and reopen it → the transaction and daily limit are still there; the log and raw captures are empty. Capture restarts by itself when you open the app (Shizuku still running).

### TC16 — Capture stopped
Tap **Stop capture** (or Stop in the notification) and make a payment. Then stop Shizuku and open UPI Detector.

Expected: the card says *Capture: OFF*; nothing is recorded; the log shows `capture stopped`. With Shizuku stopped the card says *Shizuku is not running* and Start capture is disabled.

### TC17 — Notification cross-check
With notification access on, pay ₹1 in GPay and then ₹1 in PhonePe to the same person, and wait for the bank SMS for each.

Expected: each screen row gets a UPI ref within a minute or two (`attached UPI ref … to record #N`). If a payment produced a POSSIBLE_DUPLICATE row, the second SMS with a different ref clears the flag and the total includes both. The UPI app's own notification and the bank SMS for the same payment produce one `attached` plus one `confirms` line — never a new row. Note which banks' SMS were `ignored` (the report counts them) so their format can be added.

### Device test (no UPI app, no payment)
`PaymentFlowDeviceTest` runs the read pipeline and a real SQLite database on the phone: a successful payment (processing window, then the result window above the chat), a failed one, the app going to the background, a bank-SMS cross-check, and a restore as after a restart. It uses its own database and deletes it. Build: `./gradlew :app:assembleDebugAndroidTest`. Run without uninstalling the app:

```
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w io.yestack.upidetector.test/android.test.InstrumentationTestRunner
```

`./gradlew :app:connectedDebugAndroidTest` also works but uninstalls the app afterwards, which also removes its Shizuku permission. Instrumenting restarts the app's process: open UPI Detector afterwards and capture restarts if it was on.

## 6. Exporting the diagnostic report

Tap **Share report** and send it to yourself (email, WhatsApp "Message yourself", Drive, Notes). It is plain text and contains:

- device model, Android version, app version, whether capture was running, which apps are installed;
- every transaction with all fields and the expense total;
- the full live log;
- the last 30 raw screen captures, each with every text node (text | description | view ID) and the parser's verdict.

When a payment was **missed or wrong**, send the report together with: which test case, which app and app version, and what the screen showed. The raw capture of that screen is what's needed to tune the parser.

Privacy: the report contains payee names, amounts and UPI references from your screens. Share it only with people you trust. Nothing leaves the phone unless you share it.

## 7. Results

| TC | GPay | PhonePe | Paytm | Notes |
|---|---|---|---|---|
| 1–3 success | | | | |
| 4 failed | | | | |
| 5 pending | | | | |
| 6 screen left open | | | | |
| 7 reopen from history | | | | |
| 8 two same-amount payments | | | | |
| 9 history list | | | | |
| 10 home / balance | | | | |
| 11 Hindi UI | | | | |
| 12 received | | | | |
| 13 Keep / Merge | | | | |
| 14 raw switch | | | | |
| 15 clear / force-stop | | | | |
| 16 capture stopped | | | | |

Detection counts as working for an app only after TC1–3, TC4, TC6 and TC9 pass for that app on a real phone.
