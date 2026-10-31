package io.yestack.upidetector.bridge

import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import io.yestack.upidetector.data.ExpenseDb
import io.yestack.upidetector.data.RowMeta
import java.math.BigDecimal
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectorJsonTest {

    private val t = Transaction(
        id = 12, sourceApp = "net.one97.paytm", amount = BigDecimal("149.50"), status = TxnStatus.SUCCESS,
        direction = Direction.DEBIT, merchant = null, upiRef = "123456789012", detectedAtMillis = 1_700_000_000_000L,
        updatedAtMillis = 1_700_000_005_000L, sessionId = 3L, flag = null, flagReason = null,
        possibleDuplicateOfId = null, note = "lunch",
    )

    @Test
    fun detectedTxnHasEveryContractFieldWithNullsExplicit() {
        val o = DetectorJson.txn(t, RowMeta(synced = true, dirty = false, remoteId = "uuid-1", syncedAtMillis = 1_700_000_009_000L, owner = "u1", epoch = 0))
        assertEquals(12L, o.getLong("id"))
        assertEquals("net.one97.paytm", o.getString("sourceApp"))
        assertEquals("149.50", o.getString("amount"))
        assertEquals("SUCCESS", o.getString("status"))
        assertEquals("DEBIT", o.getString("direction"))
        assertTrue(o.has("merchant") && o.isNull("merchant"))
        assertEquals("123456789012", o.getString("upiRef"))
        assertEquals(1_700_000_000_000L, o.getLong("detectedAtMillis"))
        assertEquals(1_700_000_005_000L, o.getLong("updatedAtMillis"))
        assertTrue(o.has("flag") && o.isNull("flag"))
        assertTrue(o.has("flagReason") && o.isNull("flagReason"))
        assertTrue(o.has("possibleDuplicateOfId") && o.isNull("possibleDuplicateOfId"))
        assertEquals("lunch", o.getString("note"))
        assertTrue(o.getBoolean("synced"))
        assertFalse(o.getBoolean("dirty"))
        assertEquals("uuid-1", o.getString("remoteId"))
        assertEquals(1_700_000_009_000L, o.getLong("syncedAtMillis"))
    }

    @Test
    fun aRecordWithNoSyncRowIsNotSyncedAndNotDirty() {
        val o = DetectorJson.txn(t, null)
        assertFalse(o.getBoolean("synced"))
        assertFalse(o.getBoolean("dirty"))
        assertTrue(o.has("remoteId") && o.isNull("remoteId"))
        assertTrue(o.has("syncedAtMillis") && o.isNull("syncedAtMillis"))
    }

    @Test
    fun pendingAddsExternalRefAndAlreadySynced() {
        val o = DetectorJson.pending(
            ExpenseDb.Pending(t, "upi:abc:2:12", RowMeta(synced = true, dirty = true, remoteId = "uuid-1", syncedAtMillis = 5L, owner = "u1", epoch = 2)),
        )
        assertEquals("upi:abc:2:12", o.getString("externalRef"))
        assertTrue(o.getBoolean("alreadySynced"))
        assertTrue(o.getBoolean("dirty"))
        assertTrue(o.getBoolean("synced"))
    }

    @Test
    fun acksParseWithAndWithoutRemoteId() {
        val acks = DetectorJson.parseAcks("""[{"id":1,"remoteId":"a"},{"id":2,"remoteId":null},{"id":3},{"remoteId":"x"}]""")
        assertEquals(listOf(1L, 2L, 3L), acks.map { it.id })
        assertEquals("a", acks[0].remoteId)
        assertNull(acks[1].remoteId)
        assertNull(acks[2].remoteId)
    }

    @Test
    fun prefsKeepCurrentValuesForMissingFlags() {
        assertEquals(false to true, DetectorJson.parsePrefs("""{"notesEnabled":false}""", true, true))
        assertEquals(true to false, DetectorJson.parsePrefs("""{"blockingEnabled":false}""", true, true))
        assertEquals(false to false, DetectorJson.parsePrefs("""{"notesEnabled":false,"blockingEnabled":false}""", true, true))
    }

    @Test
    fun statusAndPrefsShapes() {
        val s = DetectorJson.status(true, false, listOf("com.phonepe.app"))
        assertTrue(s.getBoolean("accessibilityEnabled"))
        assertFalse(s.getBoolean("notificationAccessEnabled"))
        assertEquals("com.phonepe.app", s.getJSONArray("installedApps").getString(0))
        // Accessibility is the default method; Shizuku fields are always present.
        assertEquals("accessibility", s.getString("trackingMethod"))
        assertEquals("not_installed", s.getString("shizukuState"))
        assertFalse(s.getBoolean("shizukuCaptureRunning"))
        val shizuku = DetectorJson.status(false, true, emptyList(), "shizuku", "ready", true)
        assertEquals("shizuku", shizuku.getString("trackingMethod"))
        assertEquals("ready", shizuku.getString("shizukuState"))
        assertTrue(shizuku.getBoolean("shizukuCaptureRunning"))
        val p: JSONObject = DetectorJson.prefs(true, false)
        assertTrue(p.getBoolean("notesEnabled"))
        assertFalse(p.getBoolean("blockingEnabled"))
    }
}
