package io.yestack.upidetector.ui

import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.text.TextUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.BuildConfig
import io.yestack.upidetector.R
import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Flag
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import io.yestack.upidetector.service.DumpCaptureService
import io.yestack.upidetector.service.UpiNotificationListener
import io.yestack.upidetector.shizuku.ShizukuShell
import rikka.shizuku.Shizuku
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity(), AppStore.Listener {

    private enum class Tab { TRANSACTIONS, LOG, RAW }

    private lateinit var notificationStatus: TextView
    private lateinit var appsStatus: TextView
    private lateinit var stats: TextView
    private lateinit var list: ListView
    private lateinit var empty: TextView
    private lateinit var tabButtons: Map<Tab, Button>
    private lateinit var rawCheck: CheckBox
    private lateinit var dumpStatus: TextView
    private lateinit var dumpDetail: TextView
    private lateinit var dumpButton: Button

    private val shizukuChanged = Shizuku.OnBinderReceivedListener { runOnUiThread { refreshDumpStatus() } }
    private val shizukuGone = Shizuku.OnBinderDeadListener { runOnUiThread { refreshDumpStatus() } }
    private val shizukuPermission = Shizuku.OnRequestPermissionResultListener { code, result ->
        if (code == SHIZUKU_PERMISSION_CODE) {
            runOnUiThread {
                if (result != PackageManager.PERMISSION_GRANTED) Toast.makeText(this, R.string.dump_denied, Toast.LENGTH_SHORT).show()
                refreshDumpStatus()
            }
        }
    }

    private val txnAdapter = TxnAdapter()
    private val logAdapter = LogAdapter()
    private val rawAdapter = RawAdapter()
    private var tab = Tab.TRANSACTIONS
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppStore.init(applicationContext)
        setContentView(R.layout.activity_main)
        // Android 15+ draws apps edge to edge: keep the dashboard clear of the status and navigation bars.
        if (Build.VERSION.SDK_INT >= 35) findViewById<View>(R.id.root).let { root ->
            val pad = root.paddingTop
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(pad + bars.left, pad + bars.top, pad + bars.right, pad + bars.bottom)
                insets
            }
        }
        notificationStatus = findViewById(R.id.notificationStatus)
        appsStatus = findViewById(R.id.appsStatus)
        stats = findViewById(R.id.stats)
        list = findViewById(R.id.list)
        empty = findViewById(R.id.empty)
        rawCheck = findViewById(R.id.rawCapture)
        dumpStatus = findViewById(R.id.dumpStatus)
        dumpDetail = findViewById(R.id.dumpDetail)
        dumpButton = findViewById(R.id.dumpButton)
        dumpButton.setOnClickListener { onDumpButton() }
        Shizuku.addBinderReceivedListenerSticky(shizukuChanged)
        Shizuku.addBinderDeadListener(shizukuGone)
        Shizuku.addRequestPermissionResultListener(shizukuPermission)
        tabButtons = mapOf(
            Tab.TRANSACTIONS to findViewById(R.id.tabTransactions),
            Tab.LOG to findViewById(R.id.tabLog),
            Tab.RAW to findViewById(R.id.tabRaw),
        )
        tabButtons.forEach { (t, b) -> b.setOnClickListener { selectTab(t) } }

        findViewById<Button>(R.id.openNotificationSettings).setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            } catch (e: RuntimeException) {
                Toast.makeText(this, "Could not open notification access settings: $e", Toast.LENGTH_LONG).show()
            }
        }
        rawCheck.isChecked = AppStore.rawCaptureEnabled
        rawCheck.setOnCheckedChangeListener { _, checked -> AppStore.rawCaptureEnabled = checked }
        findViewById<Button>(R.id.setLimit).setOnClickListener { editDailyLimit() }
        findViewById<Button>(R.id.share).setOnClickListener { shareReport() }
        findViewById<Button>(R.id.clear).setOnClickListener { confirmClear() }

        list.setOnItemClickListener { _, _, position, _ ->
            if (tab == Tab.RAW) showCapture(rawAdapter.getItem(position))
        }
        selectTab(Tab.TRANSACTIONS)
    }

    override fun onDestroy() {
        Shizuku.removeBinderReceivedListener(shizukuChanged)
        Shizuku.removeBinderDeadListener(shizukuGone)
        Shizuku.removeRequestPermissionResultListener(shizukuPermission)
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        AppStore.addListener(this)
        refreshData()
    }

    override fun onStop() {
        AppStore.removeListener(this)
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        // We are in front, so whichever UPI app was on screen no longer is.
        AppStore.onLastAppBackground(System.currentTimeMillis())
        restartCaptureIfWanted()
        refreshStatus()
    }

    override fun onStoreChanged() {
        refreshData()
        // The capture service logs when it starts or stops.
        refreshDumpStatus()
    }

    private fun selectTab(t: Tab) {
        tab = t
        tabButtons.forEach { (k, b) -> b.isEnabled = k != t }
        list.adapter = when (t) {
            Tab.TRANSACTIONS -> txnAdapter
            Tab.LOG -> logAdapter
            Tab.RAW -> rawAdapter
        }
        refreshData()
    }

    // ---- status ----

    private fun refreshStatus() {
        val notificationsOn = isNotificationAccessEnabled()
        notificationStatus.text =
            getString(if (notificationsOn) R.string.notification_access_on else R.string.notification_access_off)
        notificationStatus.setTextColor(getColor(if (notificationsOn) R.color.success else R.color.failed))
        appsStatus.text = installedApps().entries.joinToString("\n") { (pkg, installed) ->
            SupportedApps.displayName(pkg) + ": " + getString(if (installed) R.string.installed else R.string.not_installed)
        }
        refreshDumpStatus()
    }

    // ---- screen capture (via Shizuku) ----

    /** Capture the user started, stopped by Android or a restart of Shizuku, comes back once Shizuku is ready. */
    private fun restartCaptureIfWanted() {
        if (DumpCaptureService.isWanted(this) && !DumpCaptureService.running &&
            ShizukuShell.status() == ShizukuShell.Status.READY
        ) {
            DumpCaptureService.start(this)
        }
    }

    private fun refreshDumpStatus() {
        val running = DumpCaptureService.running
        dumpStatus.text = getString(if (running) R.string.dump_on else R.string.dump_off)
        dumpStatus.setTextColor(getColor(if (running) R.color.success else R.color.failed))
        val shizuku = ShizukuShell.status()
        dumpDetail.text = getString(
            when {
                running -> R.string.dump_running
                shizuku == ShizukuShell.Status.NOT_RUNNING -> R.string.dump_shizuku_not_running
                shizuku == ShizukuShell.Status.TOO_OLD -> R.string.dump_shizuku_too_old
                shizuku == ShizukuShell.Status.NO_PERMISSION -> R.string.dump_shizuku_no_permission
                else -> R.string.dump_ready
            },
        )
        dumpButton.setText(
            when {
                running -> R.string.dump_stop
                shizuku == ShizukuShell.Status.NO_PERMISSION -> R.string.dump_grant
                else -> R.string.dump_start
            },
        )
        dumpButton.isEnabled = running || shizuku == ShizukuShell.Status.NO_PERMISSION ||
            shizuku == ShizukuShell.Status.READY
    }

    private fun onDumpButton() {
        when {
            DumpCaptureService.running -> DumpCaptureService.stop(this)
            ShizukuShell.status() == ShizukuShell.Status.NO_PERMISSION -> Shizuku.requestPermission(SHIZUKU_PERMISSION_CODE)
            ShizukuShell.status() == ShizukuShell.Status.READY -> {
                if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    // Only for the "capture running" notification; capture starts either way.
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_CODE)
                }
                DumpCaptureService.start(this)
            }
        }
        dumpButton.postDelayed({ refreshDumpStatus() }, 300)
    }

    private fun isNotificationAccessEnabled(): Boolean {
        val mine = ComponentName(this, UpiNotificationListener::class.java)
        if (Build.VERSION.SDK_INT >= 27) {
            val nm = getSystemService(NotificationManager::class.java) ?: return false
            return nm.isNotificationListenerAccessGranted(mine)
        }
        val enabledList = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledList)
        for (entry in splitter) {
            if (ComponentName.unflattenFromString(entry) == mine) return true
        }
        return false
    }

    private fun installedApps(): Map<String, Boolean> =
        SupportedApps.all.associate { it.packageName to isInstalled(it.packageName) }

    @Suppress("DEPRECATION")
    private fun isInstalled(pkg: String): Boolean = try {
        if (Build.VERSION.SDK_INT >= 33) packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        else packageManager.getPackageInfo(pkg, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    // ---- data ----

    private fun refreshData() {
        val txns = AppStore.transactions
        val total = AppStore.expenseTotal()
        val flagged = txns.count { it.flag != null }
        val today = AppStore.todaySpent(System.currentTimeMillis()).toPlainString()
        val limit = AppStore.dailyLimit
        val todayLine = if (limit == null) getString(R.string.today_no_limit, today)
        else getString(R.string.today_format, today, limit.toPlainString())
        stats.text = todayLine + "\n" + getString(
            R.string.stats_format,
            total.toPlainString(),
            txns.count { it.status == TxnStatus.SUCCESS },
            txns.count { it.status == TxnStatus.FAILED },
            txns.count { it.status == TxnStatus.PENDING },
            flagged,
        ) + "\n" + getString(R.string.stats_note) + "\n" + getString(R.string.memory_note)

        txnAdapter.items = txns.sortedByDescending { it.detectedAtMillis }
        logAdapter.items = AppStore.logNewestFirst
        rawAdapter.items = AppStore.rawCaptures
        listOf(txnAdapter, logAdapter, rawAdapter).forEach { it.notifyDataSetChanged() }

        val current = when (tab) {
            Tab.TRANSACTIONS -> txnAdapter.count
            Tab.LOG -> logAdapter.count
            Tab.RAW -> rawAdapter.count
        }
        empty.setText(
            when (tab) {
                Tab.TRANSACTIONS -> R.string.empty_transactions
                Tab.LOG -> R.string.empty_log
                Tab.RAW -> R.string.empty_raw
            },
        )
        empty.visibility = if (current == 0) View.VISIBLE else View.GONE
    }

    // ---- actions ----

    private fun confirmClear() {
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_confirm_title)
            .setMessage(R.string.clear_confirm_message)
            .setPositiveButton(R.string.clear) { _, _ -> AppStore.clear() }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun editDailyLimit() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setHint(R.string.daily_limit_hint)
            AppStore.dailyLimit?.let { setText(it.toPlainString()) }
        }
        val box = FrameLayout(this).apply {
            setPadding(dp(20), dp(4), dp(20), 0)
            addView(input)
        }
        val builder = AlertDialog.Builder(this)
            .setTitle(R.string.daily_limit_title)
            .setMessage(R.string.daily_limit_message)
            .setView(box)
            .setPositiveButton(R.string.save) { _, _ ->
                val value = input.text.toString().trim().toBigDecimalOrNull()
                if (value == null || value.signum() <= 0 || value.stripTrailingZeros().scale() > 2) {
                    Toast.makeText(this, R.string.daily_limit_invalid, Toast.LENGTH_LONG).show()
                } else {
                    AppStore.updateDailyLimit(value)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
        if (AppStore.dailyLimit != null) {
            builder.setNeutralButton(R.string.daily_limit_remove) { _, _ -> AppStore.updateDailyLimit(null) }
        }
        builder.show()
    }

    private fun confirmMerge(t: Transaction) {
        AlertDialog.Builder(this)
            .setTitle(R.string.merge_confirm_title)
            .setMessage(R.string.merge_confirm_message)
            .setPositiveButton(R.string.merge) { _, _ -> AppStore.merge(t.id) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showCapture(c: AppStore.RawCapture) {
        val body = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 11f
            setTextIsSelectable(true)
            setPadding(dp(16), dp(8), dp(16), dp(8))
            text = ReportBuilder.formatNodes(c)
        }
        val scroll = ScrollView(this).apply { addView(body) }
        AlertDialog.Builder(this)
            .setTitle(
                "${SupportedApps.displayName(c.snapshot.packageName)} ${c.snapshot.screenClass ?: "?"}\n" +
                    "text | desc | viewId",
            )
            .setView(scroll)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun shareReport() {
        val header = ReportBuilder.Header(
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            device = "${Build.MANUFACTURER} ${Build.MODEL}",
            androidVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            timeMillis = System.currentTimeMillis(),
            captureRunning = DumpCaptureService.running,
            installed = installedApps(),
            notificationAccess = isNotificationAccessEnabled(),
            notificationsIgnored = AppStore.ignoredNotificationCount,
        )
        val report = ReportBuilder.build(
            header, AppStore.transactions.sortedByDescending { it.detectedAtMillis },
            AppStore.expenseTotal(), AppStore.logNewestFirst, AppStore.rawCaptures,
        )
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "UPI Detector report")
            putExtra(Intent.EXTRA_TEXT, report)
        }
        try {
            startActivity(Intent.createChooser(send, getString(R.string.share_title)))
        } catch (e: RuntimeException) {
            Toast.makeText(this, "Could not share the report: $e", Toast.LENGTH_LONG).show()
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private companion object {
        const val SHIZUKU_PERMISSION_CODE = 41
        const val NOTIFICATION_PERMISSION_CODE = 42
    }

    // ---- adapters ----

    private abstract inner class ListAdapter<T> : BaseAdapter() {
        var items: List<T> = emptyList()
        override fun getCount() = items.size
        override fun getItem(position: Int): T = items[position]
        override fun getItemId(position: Int) = position.toLong()
    }

    private inner class TxnAdapter : ListAdapter<Transaction>() {
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: LayoutInflater.from(this@MainActivity).inflate(R.layout.item_txn, parent, false)
            val t = getItem(position)
            v.findViewById<TextView>(R.id.app).text = SupportedApps.displayName(t.sourceApp)
            v.findViewById<TextView>(R.id.amount).text = "₹" + t.amount.toPlainString()
            v.findViewById<TextView>(R.id.statusLine).apply {
                text = "${t.status} · ${directionLabel(t.direction)}"
                setTextColor(
                    getColor(
                        when (t.status) {
                            TxnStatus.SUCCESS -> R.color.success
                            TxnStatus.FAILED -> R.color.failed
                            TxnStatus.PENDING -> R.color.pending
                        },
                    ),
                )
            }
            v.findViewById<TextView>(R.id.merchant).text = (t.merchant ?: "(no merchant)") +
                (t.note?.let { " · " + getString(R.string.note_label, it) } ?: "")
            v.findViewById<TextView>(R.id.meta).text =
                "Ref ${t.upiRef ?: "-"} · ${timeFormat.format(Date(t.detectedAtMillis))}" +
                    if (t.updatedAtMillis != t.detectedAtMillis) " (updated ${timeFormat.format(Date(t.updatedAtMillis))})" else ""
            val flagged = t.flag == Flag.POSSIBLE_DUPLICATE
            v.findViewById<View>(R.id.flagBox).visibility = if (flagged) View.VISIBLE else View.GONE
            v.findViewById<TextView>(R.id.flagReason).text = t.flagReason.orEmpty()
            v.findViewById<Button>(R.id.keep).setOnClickListener { AppStore.keep(t.id) }
            v.findViewById<Button>(R.id.merge).setOnClickListener { confirmMerge(t) }
            return v
        }

        private fun directionLabel(d: Direction) = when (d) {
            Direction.DEBIT -> "Debit"
            Direction.CREDIT -> "Credit"
            Direction.UNKNOWN -> "Direction unknown"
        }
    }

    private inner class LogAdapter : ListAdapter<String>() {
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val tv = (convertView as? TextView) ?: TextView(this@MainActivity).apply {
                typeface = Typeface.MONOSPACE
                textSize = 11f
                setPadding(dp(12), dp(3), dp(12), dp(3))
                setTextColor(getColor(R.color.text_primary))
            }
            tv.text = getItem(position)
            return tv
        }
    }

    private inner class RawAdapter : ListAdapter<AppStore.RawCapture>() {
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: LayoutInflater.from(this@MainActivity).inflate(R.layout.item_row, parent, false)
            val c = getItem(position)
            v.findViewById<TextView>(R.id.title).text =
                "${SupportedApps.displayName(c.snapshot.packageName)} · ${c.snapshot.screenClass ?: "?"}"
            v.findViewById<TextView>(R.id.subtitle).text =
                "${timeFormat.format(Date(c.timeMillis))} · ${c.snapshot.nodes.size} nodes · ${c.verdict}"
            return v
        }
    }
}
