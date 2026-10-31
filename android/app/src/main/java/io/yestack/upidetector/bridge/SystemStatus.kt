package io.yestack.upidetector.bridge

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.view.accessibility.AccessibilityManager
import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.service.UpiAccessibilityService
import io.yestack.upidetector.service.UpiNotificationListener
import io.yestack.upidetector.shizuku.ShizukuShell

/** Which of the detector's permissions are on, where Shizuku stands and which UPI apps are installed. Read-only; main thread. */
object SystemStatus {

    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val am = context.getSystemService(AccessibilityManager::class.java)
        if (am == null || !am.isEnabled) return false
        val enabledList = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        val mine = ComponentName(context, UpiAccessibilityService::class.java)
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledList)
        for (entry in splitter) {
            // Entries may be written in short ("pkg/.Cls") or long form.
            if (ComponentName.unflattenFromString(entry) == mine) return true
            if (entry.equals(mine.flattenToString(), true) || entry.equals(mine.flattenToShortString(), true)) return true
        }
        return false
    }

    fun isNotificationAccessEnabled(context: Context): Boolean {
        val mine = ComponentName(context, UpiNotificationListener::class.java)
        val enabledList = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        if (enabledList != null) {
            val splitter = TextUtils.SimpleStringSplitter(':')
            splitter.setString(enabledList)
            for (entry in splitter) {
                if (ComponentName.unflattenFromString(entry) == mine) return true
            }
        }
        if (Build.VERSION.SDK_INT >= 27) {
            return context.getSystemService(NotificationManager::class.java)?.isNotificationListenerAccessGranted(mine) == true
        }
        return false
    }

    const val SHIZUKU_PACKAGE = "moe.shizuku.privileged.api"

    /**
     * Where the Shizuku tracking method stands: "not_installed" (no Shizuku app), "not_running" (installed, service not
     * started), "too_old", "no_permission" (Paisa not allowed to use it yet) or "ready".
     */
    fun shizukuState(context: Context): String = when (ShizukuShell.status()) {
        ShizukuShell.Status.READY -> "ready"
        ShizukuShell.Status.NO_PERMISSION -> "no_permission"
        ShizukuShell.Status.TOO_OLD -> "too_old"
        ShizukuShell.Status.NOT_RUNNING -> if (isInstalled(context, SHIZUKU_PACKAGE)) "not_running" else "not_installed"
    }

    /** Package names of the supported UPI apps installed on this phone. */
    fun installedApps(context: Context): List<String> =
        SupportedApps.all.map { it.packageName }.filter { isInstalled(context, it) }

    @Suppress("DEPRECATION")
    private fun isInstalled(context: Context, pkg: String): Boolean = try {
        val pm = context.packageManager
        if (Build.VERSION.SDK_INT >= 33) pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0)) else pm.getPackageInfo(pkg, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    } catch (e: RuntimeException) {
        false
    }
}
