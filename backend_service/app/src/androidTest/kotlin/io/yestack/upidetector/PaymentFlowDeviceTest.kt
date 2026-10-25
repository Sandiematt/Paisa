// android.test is the platform's own (deprecated) runner; AndroidX is deliberately not used.
@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package io.yestack.upidetector

import android.test.AndroidTestCase
import io.yestack.upidetector.core.Decision
import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.DuplicateDetector
import io.yestack.upidetector.core.NotificationHit
import io.yestack.upidetector.core.PaymentPipeline
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TextNode
import io.yestack.upidetector.core.TxnStatus
import io.yestack.upidetector.data.ExpenseDb
import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * On the phone: a successful payment, a failed one, the app going to the background and a bank-SMS cross-check, run
 * through the real read pipeline and saved in a real SQLite database, then restored as after a restart. Screens are
 * fixtures in the shape the service reads them (PhonePe's result in its own window above the chat); no UPI app is
 * opened and no payment is made. Uses its own database, deleted afterwards; the app's expense history is not touched.
 *
 * Run: ./gradlew :app:connectedDebugAndroidTest (this uninstalls the app afterwards), or install both APKs and
 * `adb shell am instrument -w io.yestack.upidetector.test/android.test.InstrumentationTestRunner`.
 */
class PaymentFlowDeviceTest : AndroidTestCase() {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val phonePe = "com.phonepe.app"
    private val chatActivity = "com.phonepe.app.chat.chatframework.ui.view.activity.Navigator_ChatActivity"
    private val pinActivity = "org.npci.upi.security.pinactivitycomponent.GetCredential"

    private lateinit var db: ExpenseDb

    private fun window(id: Int, vararg texts: String) =
        ScreenSnapshot(phonePe, chatActivity, id, texts.map { TextNode(it, null, null) })

    private val chat = window(10, "Ravi (bro)", "₹11", "PAID", "3:40 PM", "Enter amount or chat")

    override fun setUp() {
        super.setUp()
        context.deleteDatabase(DB_NAME)
        db = ExpenseDb(context, DB_NAME)
    }

    override fun tearDown() {
        db.close()
        context.deleteDatabase(DB_NAME)
        super.tearDown()
    }

    fun testSuccessFailureBackgroundAndNotificationSurviveARestart() {
        val pipeline = PaymentPipeline()
        val d = pipeline.detector

        // Successful payment: chat, PIN screen (not read), processing window, result window above the chat.
        val t0 = at("2026-10-24T15:43:00")
        d.onScreenChanged(phonePe, chatActivity, 1, t0)
        assertNotNull(pipeline.onRead(listOf(chat), null, t0, ist))
        assertTrue(d.transactions.isEmpty())
        d.onScreenChanged(phonePe, pinActivity, 2, t0 + 1_000)
        d.onPaymentAttempt(phonePe, t0 + 1_000)
        d.onScreenChanged(phonePe, chatActivity, 1, t0 + 3_000)
        pipeline.forgetLastRead()
        pipeline.onRead(listOf(window(20, "Processing payment", "₹1", "Ravi (bro)"), chat), null, t0 + 3_500, ist)
        assertEquals(TxnStatus.PENDING, d.transactions.single().status)
        val success = pipeline.onRead(
            listOf(window(20, "Payment Successful", "24 October 2026 at 03:43 PM", "Ravi (bro)", "₹1", "Done"), chat),
            null, t0 + 5_000, ist,
        )!!
        val paid = success.notePayment
        assertNotNull("a live success asks for a note", paid)
        assertTrue(d.attachNote(paid!!.id, "Lunch"))

        // Background transition ends the session.
        val ended = d.onAppBackground(phonePe, t0 + 8_000)
        assertTrue(ended.any { it is Decision.SessionEnded })

        // Bank SMS for that payment: attaches its UPI ref.
        d.onNotification(NotificationHit(SMS, BigDecimal("1.00"), "182767326152", Direction.DEBIT, t0 + 20_000), t0 + 20_000)
        assertEquals("182767326152", d.transactions.single { it.id == paid.id }.upiRef)

        // Failed payment: recorded, never an expense, no note.
        val t1 = at("2026-10-24T15:50:00")
        d.onScreenChanged(phonePe, chatActivity, 1, t1)
        pipeline.forgetLastRead()
        val failed = pipeline.onRead(
            listOf(window(21, "Payment Failed", "24 October 2026 at 03:50 PM", "Ravi (bro)", "₹11", "Done"), chat),
            null, t1, ist,
        )!!
        assertNull(failed.notePayment)
        assertEquals(2, d.transactions.size)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))

        // Saved, then restored into a fresh detector as after a restart.
        d.transactions.forEach { db.upsert(it) }
        db.putSetting(ExpenseDb.KEY_DAILY_LIMIT, "10")
        val restored = DuplicateDetector().apply { restore(db.loadTransactions()) }
        assertEquals(d.transactions.toSet(), restored.transactions.toSet())
        assertEquals(0, BigDecimal("1").compareTo(restored.expenseTotal()))
        assertEquals("Lunch", restored.transactions.single { it.id == paid.id }.note)
        assertEquals(TxnStatus.FAILED, restored.transactions.single { it.id != paid.id }.status)
        assertEquals("10", db.getSetting(ExpenseDb.KEY_DAILY_LIMIT))
    }

    fun testBankSmsAfterAnotherAppsPinScreenWaitsForThatApp() {
        val gpay = "com.google.android.apps.nbu.paisa.user"
        val pipeline = PaymentPipeline()
        val d = pipeline.detector
        val t0 = at("2026-10-24T15:53:56")
        d.onScreenChanged(gpay, "MainActivity", 5, t0)
        pipeline.onRead(
            listOf(ScreenSnapshot(gpay, "MainActivity", 5, listOf("Payment successful", "₹1", "Paid to Ravi").map { TextNode(it, null, null) })),
            null, t0, ist,
        )
        d.onPaymentAttempt(phonePe, t0 + 40_000)
        d.onNotification(NotificationHit(SMS, BigDecimal("1.00"), "182767326152", Direction.DEBIT, t0 + 53_000), t0 + 53_000)
        assertNull(d.transactions.single().upiRef)
    }

    private companion object {
        const val DB_NAME = "device-test-expenses.db"
        const val SMS = "com.google.android.apps.messaging"
    }
}
