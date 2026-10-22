package io.yestack.upidetector.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpiTextParserReferenceTest {

    private fun parse(vararg texts: String?) =
        UpiTextParser.parse(snap("₹1", "Payment successful", *texts)).candidate()

    private val ref = "412345678901"

    // ---- app screens ---------------------------------------------------------------

    @Test
    fun gpayUpiTransactionIdNextNodeAndGoogleIdIgnored() {
        val c = UpiTextParser.parse(
            snap(
                "₹1.00", "Paid to Ravi Kumar", "Payment successful",
                "UPI transaction ID", ref, "Google transaction ID", "CICAgKDzxyz123",
            ),
        ).candidate()
        assertEquals(ref, c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    @Test
    fun phonePeUtrSameNodeAndTransactionIdIgnored() {
        val c = UpiTextParser.parse(
            snap("Transaction Successful", "Paid to", "RAVI KUMAR", "₹1", "UTR: $ref", "Transaction ID", "T2310221234567890"),
        ).candidate()
        assertEquals(ref, c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    @Test
    fun paytmUpiRefNoAndOrderIdIgnored() {
        val c = UpiTextParser.parse(
            snap("Paid Successfully", "Rs.1", "To: Ravi", "UPI Ref No: $ref", "Order ID: 20231022123456789"),
        ).candidate()
        assertEquals(ref, c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    // ---- labels --------------------------------------------------------------------

    private val labels = listOf(
        "UPI Ref No", "UPI Ref. No.", "UPI Reference No", "UPI Reference Number",
        "UPI transaction ID", "UPI Txn ID", "UTR", "UTR No", "Ref No", "Ref. No.",
        "upi ref no", "UTR NO",
    )

    @Test
    fun everyLabelWorksInSameNode() {
        labels.forEach { label ->
            assertEquals(label, ref, parse("$label: $ref").upiRef)
            assertEquals(label, ref, parse("$label $ref").upiRef)
            assertEquals(label, ref, parse("$label:$ref").upiRef)
        }
    }

    @Test
    fun everyLabelWorksWithValueInNextNode() {
        labels.forEach { label ->
            val c = parse(label, ref)
            assertEquals(label, ref, c.upiRef)
            assertNull(label, c.refExtractionFailure)
            assertEquals(label, ref, parse("$label:", ref).upiRef)
        }
    }

    @Test
    fun groupedDigitsAreNormalised() {
        assertEquals(ref, parse("UTR: 4123 4567 8901").upiRef)
        assertEquals(ref, parse("UPI Ref No", "4123 4567 8901").upiRef)
    }

    @Test
    fun trailingDateAfterRefIsNotPartOfIt() {
        val c = parse("UTR: $ref 12 Oct 2026")
        assertEquals(ref, c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    // ---- not a reference -----------------------------------------------------------

    @Test
    fun unlabelledTwelveDigitsIsNeverAReference() {
        val c = parse("Call 919876543210", "919876543210", "A/c 123456789012")
        assertNull(c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    @Test
    fun noLabelMeansNoRefAndNoFailure() {
        val c = parse("Paid to Ravi")
        assertNull(c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    @Test
    fun appSpecificIdsAreIgnoredWithoutFailure() {
        val ignored = listOf(
            listOf("Google transaction ID", "CICAgKDzxyz123"),
            listOf("Google transaction ID", ref),
            listOf("Transaction ID", ref),
            listOf("Transaction ID: T2310221234567890"),
            listOf("Order ID: 20231022123456789"),
            listOf("Order ID", ref),
        )
        ignored.forEach { texts ->
            val c = parse(*texts.toTypedArray())
            assertNull(texts.toString(), c.upiRef)
            assertNull(texts.toString(), c.refExtractionFailure)
        }
    }

    @Test
    fun wrongLengthOrNonNumericValueGivesFailureMessage() {
        val bad = mapOf(
            "12345678901" to "11 digits",
            "1234567890123" to "13 digits",
            "ABCDEFGHIJKL" to "non-numeric",
            "41234567890X" to "non-numeric",
        )
        bad.forEach { (value, why) ->
            listOf(listOf("UTR: $value"), listOf("UTR", value)).forEach { texts ->
                val c = parse(*texts.toTypedArray())
                assertNull(texts.toString(), c.upiRef)
                val failure = c.refExtractionFailure
                assertNotNull(texts.toString(), failure)
                assertTrue(failure, failure!!.contains("UTR") && failure.contains(value) && failure.contains(why))
            }
        }
    }

    @Test
    fun labelWithNoValueGivesFailure() {
        val c = parse("UPI Ref No")
        assertNull(c.upiRef)
        assertNotNull(c.refExtractionFailure)
    }

    @Test
    fun aValidLabelledReferenceWinsOverAnEarlierBadOne() {
        val c = parse("UTR: 123", "UPI Ref No: $ref")
        assertEquals(ref, c.upiRef)
        assertNull(c.refExtractionFailure)
    }

    @Test
    fun refValueIsNotTreatedAsMerchantOrAmount() {
        val c = UpiTextParser.parse(snap("Payment successful", "₹5", "Paid to", "UTR: $ref")).candidate()
        assertNull(c.merchant)
        assertEquals(amt("5"), c.amount)
    }
}
