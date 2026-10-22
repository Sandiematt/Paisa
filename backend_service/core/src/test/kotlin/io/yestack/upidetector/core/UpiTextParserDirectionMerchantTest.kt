package io.yestack.upidetector.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpiTextParserDirectionMerchantTest {

    private fun parse(vararg texts: String?) = UpiTextParser.parse(snap(*texts)).candidate()

    // ---- direction ----------------------------------------------------------------

    @Test
    fun directionTable() {
        val cases = listOf(
            listOf("Paid to Ravi") to Direction.DEBIT,
            listOf("Sent to Ravi") to Direction.DEBIT,
            listOf("Payment to Ravi") to Direction.DEBIT,
            listOf("Rs 5 debited from A/c") to Direction.DEBIT,
            listOf("Received from Asha") to Direction.CREDIT,
            listOf("₹5 credited to your account") to Direction.CREDIT,
            listOf("Money received") to Direction.CREDIT,
            listOf("Paid to Ravi", "Received from Asha") to Direction.UNKNOWN,
            listOf("Debited", "Credited") to Direction.UNKNOWN,
            // "Payment successful" alone only ever describes money going out.
            listOf("Thanks") to Direction.DEBIT,
        )
        cases.forEach { (texts, expected) ->
            val c = parse("₹5", "Payment successful", *texts.toTypedArray())
            assertEquals(texts.toString(), expected, c.direction)
        }
    }

    @Test
    fun directionPerApp() {
        assertEquals(Direction.DEBIT, parse("₹1.00", "Paid to Ravi Kumar", "Payment successful").direction)
        assertEquals(Direction.DEBIT, parse("Transaction Successful", "Paid to", "RAVI KUMAR", "₹1").direction)
        assertEquals(Direction.DEBIT, parse("Paid Successfully", "Rs.1", "To: Ravi").direction)
        assertEquals(Direction.UNKNOWN, parse("Transaction successful", "₹1").direction)
        assertEquals(Direction.CREDIT, parse("Received successfully", "₹1", "Received from Asha").direction)
    }

    @Test
    fun directionNeverRejects() {
        assertEquals(Direction.UNKNOWN, parse("₹1", "Payment failed").direction)
    }

    // ---- merchant -----------------------------------------------------------------

    @Test
    fun gpayMerchantInSameNode() {
        assertEquals("Ravi Kumar", parse("₹1.00", "Paid to Ravi Kumar", "Payment successful").merchant)
    }

    @Test
    fun phonePeMerchantInNextNode() {
        val c = parse("Transaction Successful", "Paid to", "RAVI KUMAR", "₹1", "UTR: 412345678901")
        assertEquals("RAVI KUMAR", c.merchant)
    }

    @Test
    fun paytmMerchantFromToLabel() {
        assertEquals("Ravi", parse("Paid Successfully", "Rs.1", "To: Ravi").merchant)
        assertEquals("Ravi", parse("Paid Successfully", "Rs.1", "To Ravi").merchant)
        assertEquals("Ravi", parse("Paid Successfully", "Rs.1", "To", "Ravi").merchant)
    }

    @Test
    fun merchantTable() {
        val cases = mapOf(
            "Sent to Dad" to "Dad",
            "sent to   Dad  " to "Dad",
            "Received from Asha Rao" to "Asha Rao",
            "₹1 paid to Ravi Stores" to "Ravi Stores",
        )
        cases.forEach { (text, expected) ->
            assertEquals(text, expected, parse("₹1", "Payment successful", text).merchant)
        }
    }

    @Test
    fun merchantIsNullWhenNothingConservativelyUsable() {
        // Next node is an amount, a status phrase, a reference or blank -> skipped.
        assertNull(parse("Payment successful", "Paid to", "₹1").merchant)
        assertNull(parse("₹1", "Paid to", "Payment successful").merchant)
        assertNull(parse("₹1", "Payment successful", "Paid to", "UTR: 412345678901").merchant)
        assertNull(parse("₹1", "Payment successful", "Paid to", "412345678901").merchant)
        assertNull(parse("₹1", "Payment successful", "Paid to", " ", "Ravi").merchant)
        assertNull(parse("₹1", "Payment successful", "Paid to").merchant)
        assertNull(parse("₹1", "Payment successful", "Tomorrow", "Total").merchant)
    }

    @Test
    fun merchantWithAmountInSameNodeIsSkipped() {
        assertNull(parse("Payment successful", "Paid to Ravi ₹50", "₹50").merchant)
    }
}
