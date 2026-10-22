package io.yestack.upidetector.service

import android.app.Notification
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.NotificationSources

/**
 * Cross-verify only: hands the title and text of allowlisted notifications to [AppStore], which parses them into
 * amount, direction and UPI reference and drops the text. Raw notification text is never stored or logged.
 * Notifications already showing when the listener connects are not read: they would be old.
 */
class UpiNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        AppStore.post { AppStore.log("listener connected") }
    }

    override fun onListenerDisconnected() {
        AppStore.post { AppStore.log("listener disconnected") }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        try {
            sbn ?: return
            val pkg = sbn.packageName
            if (!NotificationSources.isSource(pkg)) return
            val n = sbn.notification ?: return
            if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
            val extras = n.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            var text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
            // Google/Samsung Messages put the SMS in a MessagingStyle conversation: the newest message is last.
            lastMessageText(extras)?.let { text = it }
            val postedAt = sbn.postTime
            AppStore.post { AppStore.onNotification(pkg, title, text, postedAt) }
        } catch (t: Throwable) {
            val message = t.toString() // exception text only, never notification content
            AppStore.post { AppStore.log("ERROR in notification listener: $message") }
        }
    }

    @Suppress("DEPRECATION")
    private fun lastMessageText(extras: Bundle): String? {
        val raw = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return null
        if (raw.isEmpty()) return null
        if (Build.VERSION.SDK_INT >= 24) {
            val bundles: Array<Parcelable> = raw.filterIsInstance<Bundle>().toTypedArray()
            val last = Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles).lastOrNull()
            return last?.text?.toString()
        }
        return (raw.lastOrNull() as? Bundle)?.getCharSequence("text")?.toString()
    }
}
