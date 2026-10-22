package io.yestack.upidetector.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpiTextParserStatusAmountTest {

    private fun statusOf(vararg texts: String?) = UpiTextParser.parse(snap(*texts)).candidate().status

    // ---- status per app ---------------------------------------------------------------

    @Test
    fun successScreensForEachApp() {
        val screens = listOf(
            snap("₹1.00", "Paid to Ravi Kumar", "Payment successful", "UPI transaction ID", "412345678901"),
            snap("Transaction Successful", "Paid to", "RAVI KUMAR", "₹1", "UTR: 412345678901"),
            snap("Paid Successfully", "Rs.1", "To: Ravi", "UPI Ref No: 412345678901"),
        )
        screens.forEach { assertEquals(TxnStatus.SUCCESS, UpiTextParser.parse(it).candidate().status) }
    }

    @Test
    fun failedScreensForEachApp() {
        val screens = listOf(
            snap("₹1.00", "Payment failed", "Money will be refunded"),
            snap("Transaction Failed", "₹1", "RAVI KUMAR"),
            snap("Payment could not be processed", "Rs.1", "To: Ravi"),
        )
        screens.forEach { assertEquals(TxnStatus.FAILED, UpiTextParser.parse(it).candidate().status) }
    }

    @Test
    fun pendingScreensForEachApp() {
        val screens = listOf(
            snap("₹1.00", "Payment pending", "Check back later"),
            snap("Transaction Pending", "₹1", "RAVI KUMAR"),
            snap("Payment is processing", "Rs.1", "To: Ravi"),
        )
        screens.forEach { assertEquals(TxnStatus.PENDING, UpiTextParser.parse(it).candidate().status) }
    }

    @Test
    fun statusPhraseTable() {
        val cases = mapOf(
            "payment successful" to TxnStatus.SUCCESS,
            "PAID SUCCESSFULLY" to TxnStatus.SUCCESS,
            "Transaction successful" to TxnStatus.SUCCESS,
            "Money sent successfully" to TxnStatus.SUCCESS,
            "Sent successfully" to TxnStatus.SUCCESS,
            "Payment completed" to TxnStatus.SUCCESS,
            "Received successfully" to TxnStatus.SUCCESS,
            "Payment   successful" to TxnStatus.SUCCESS,
            "Payment\nsuccessful" to TxnStatus.SUCCESS,
            "Payment successful" to TxnStatus.SUCCESS,
            "payment failed" to TxnStatus.FAILED,
            "Transaction failed" to TxnStatus.FAILED,
            "Transaction declined" to TxnStatus.FAILED,
            "Payment declined" to TxnStatus.FAILED,
            "Payment unsuccessful" to TxnStatus.FAILED,
            "Transaction could not be completed" to TxnStatus.FAILED,
            "Payment could not be processed" to TxnStatus.FAILED,
            "Payment pending" to TxnStatus.PENDING,
            "Transaction pending" to TxnStatus.PENDING,
            "Payment processing" to TxnStatus.PENDING,
            "Processing payment" to TxnStatus.PENDING,
            "Payment is processing" to TxnStatus.PENDING,
            "Awaiting confirmation" to TxnStatus.PENDING,
            "Payment in progress" to TxnStatus.PENDING,
        )
        cases.forEach { (phrase, expected) ->
            assertEquals(phrase, expected, statusOf("₹10", phrase))
        }
    }

    @Test
    fun amountFollowedByPaidToCountsAsSuccess() {
        val c = UpiTextParser.parse(snap("Rs 250 paid to Ravi Kumar")).candidate()
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals("Rs 250 paid to", c.statusPhrase)
        assertEquals(amt("250"), c.amount)
        assertEquals(TxnStatus.SUCCESS, statusOf("₹250 paid to Ravi"))
    }

    @Test
    fun statusPhraseAndNodeIndexReported() {
        val c = UpiTextParser.parse(snap("Close", "₹5", "Transaction FAILED", "x")).candidate()
        assertEquals("Transaction FAILED", c.statusPhrase)
        assertEquals(2, c.statusNodeIndex)
    }

    @Test
    fun statusFoundInContentDescription() {
        val s = ScreenSnapshot(
            "p", null, null,
            listOf(TextNode(null, "Payment successful", null), TextNode("₹7", null, null)),
        )
        val c = UpiTextParser.parse(s).candidate()
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals(0, c.statusNodeIndex)
    }

    // ---- rejections ----------------------------------------------------------------

    @Test
    fun emptyAndBlankSnapshotsAreRejectedWithoutThrowing() {
        val empty = ScreenSnapshot("p", null, null, emptyList())
        val allNull = ScreenSnapshot("p", null, null, listOf(TextNode(null, null, null), TextNode("  ", "\n", "id")))
        listOf(empty, allNull).forEach {
            val r = UpiTextParser.parse(it).rejected()
            assertEquals(RejectReason.EMPTY_SNAPSHOT, r.reason)
            assertFalse(r.statusPhrasePresent)
        }
    }

    @Test
    fun noStatusPhrase() {
        val r = UpiTextParser.parse(snap("₹500", "Pay", "Enter UPI PIN")).rejected()
        assertEquals(RejectReason.NO_STATUS_PHRASE, r.reason)
        assertFalse(r.statusPhrasePresent)
    }

    @Test
    fun looseWordsInHistoryRowsAreNotStatus() {
        val history = listOf(
            snap("Paid to Ravi ₹50", "Received from Asha ₹20", "Sent to Dad ₹100", "Success"),
            snap("Transaction history", "Paid", "Sent", "Received", "₹50"),
        )
        history.forEach {
            assertEquals(RejectReason.NO_STATUS_PHRASE, UpiTextParser.parse(it).rejected().reason)
        }
    }

    @Test
    fun hindiScreenHasNoStatusPhrase() {
        val r = UpiTextParser.parse(snap("भुगतान सफल", "₹1")).rejected()
        assertEquals(RejectReason.NO_STATUS_PHRASE, r.reason)
        assertFalse(r.statusPhrasePresent)
    }

    @Test
    fun successAndFailureTogetherConflict() {
        val r = UpiTextParser.parse(snap("₹5", "Payment successful", "Payment failed")).rejected()
        assertEquals(RejectReason.CONFLICTING_STATUS, r.reason)
        assertTrue(r.statusPhrasePresent)
    }

    @Test
    fun pendingTogetherWithSuccessOrFailureConflicts() {
        listOf("Payment successful", "Payment failed").forEach { other ->
            val r = UpiTextParser.parse(snap("₹5", other, "Payment pending")).rejected()
            assertEquals(other, RejectReason.CONFLICTING_STATUS, r.reason)
            assertTrue(r.statusPhrasePresent)
        }
    }

    // ---- amount ---------------------------------------------------------------------

    @Test
    fun noAmountWhenStatusPresent() {
        val r = UpiTextParser.parse(snap("Payment successful", "Paid to Ravi")).rejected()
        assertEquals(RejectReason.NO_AMOUNT, r.reason)
        assertTrue(r.statusPhrasePresent)
    }

    @Test
    fun amountFormatsTable() {
        val cases = mapOf(
            "₹1" to "1.00",
            "₹ 1" to "1.00",
            "₹1.00" to "1.00",
            "Rs 1" to "1.00",
            "Rs. 1" to "1.00",
            "Rs.1" to "1.00",
            "rs.1" to "1.00",
            "INR 1" to "1.00",
            "inr1" to "1.00",
            "₹1,23,456.50" to "123456.50",
            "₹1,234.5" to "1234.50",
            "Rs.12,34,567" to "1234567.00",
            "₹0.50" to "0.50",
            "₹0.05" to "0.05",
        )
        cases.forEach { (text, expected) ->
            val c = UpiTextParser.parse(snap(text, "Payment successful")).candidate()
            assertEquals(text, amt(expected), c.amount)
        }
    }

    @Test
    fun amountWithoutCurrencyPrefixIsIgnored() {
        assertEquals(RejectReason.NO_AMOUNT, UpiTextParser.parse(snap("500", "Payment successful")).rejected().reason)
    }

    @Test
    fun hrsIsNotACurrency() {
        val r = UpiTextParser.parse(snap("Hrs 5", "Open 24Hrs 10", "Payment successful")).rejected()
        assertEquals(RejectReason.NO_AMOUNT, r.reason)
    }

    @Test
    fun zeroAmountsAreIgnored() {
        assertEquals(RejectReason.NO_AMOUNT, UpiTextParser.parse(snap("₹0", "₹0.00", "Payment successful")).rejected().reason)
        // A zero next to the status phrase does not shadow the real amount further away.
        assertEquals(amt("25"), UpiTextParser.parse(snap("₹25", "x", "₹0.00", "Payment successful")).candidate().amount)
    }

    @Test
    fun nearestAmountToStatusPhraseWinsWhenUnique() {
        val c = UpiTextParser.parse(
            snap("₹500", "Wallet balance", "₹20", "Payment successful", "Rewards", "Cashback ₹1000"),
        ).candidate()
        assertEquals(amt("20"), c.amount)
    }

    @Test
    fun amountInSameNodeAsStatusIsDistanceZero() {
        val c = UpiTextParser.parse(snap("₹99", "₹5 Payment successful")).candidate()
        assertEquals(amt("5"), c.amount)
    }

    @Test
    fun differentAmountsEquallyNearAreAmbiguous() {
        val r = UpiTextParser.parse(snap("₹20", "Payment successful", "₹30")).rejected()
        assertEquals(RejectReason.AMBIGUOUS_AMOUNT, r.reason)
        assertTrue(r.statusPhrasePresent)
        assertTrue(r.detail, r.detail.contains("20") && r.detail.contains("30"))
    }

    @Test
    fun twoDifferentAmountsInTheNearestNodeAreAmbiguous() {
        val r = UpiTextParser.parse(snap("₹20 of ₹30", "Payment successful")).rejected()
        assertEquals(RejectReason.AMBIGUOUS_AMOUNT, r.reason)
    }

    @Test
    fun repeatedSameValueIsNotAmbiguity() {
        val c = UpiTextParser.parse(snap("₹1", "Payment successful", "Rs 1.00", "₹500")).candidate()
        assertEquals(amt("1"), c.amount)
    }

    @Test
    fun amountInContentDescriptionCounts() {
        val s = ScreenSnapshot(
            "p", null, null,
            listOf(TextNode(null, "Amount ₹42", null), TextNode("Payment successful", null, null)),
        )
        assertEquals(amt("42"), UpiTextParser.parse(s).candidate().amount)
    }
}
