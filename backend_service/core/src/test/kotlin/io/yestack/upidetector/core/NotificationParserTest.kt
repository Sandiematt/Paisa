package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull

class NotificationParserTest {
    private val sms = "com.google.android.apps.messaging"
    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val ref = "507743921781"

    private fun parse(text: String?, title: String? = null, pkg: String = sms) =
        NotificationParser.parse(pkg, title, text, 1_000L)

    private fun assertHit(hit: NotificationHit?, amount: String, direction: Direction, ref: String = this.ref) {
        assertNotNull(hit)
        hit!!
        assertEquals("amount ${hit.amount}", 0, BigDecimal(amount).compareTo(hit.amount))
        assertEquals(2, hit.amount.scale())
        assertEquals(ref, hit.upiRef)
        assertEquals(direction, hit.direction)
        assertEquals(1_000L, hit.postedAtMillis)
    }

    @Test fun hdfc() = assertHit(
        parse("Sent Rs.1.00 From HDFC Bank A/C *1234 To MATHEN On 23/10/26 Ref 507743921781 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808"),
        "1.00", Direction.DEBIT,
    )

    @Test fun sbi() = assertHit(
        parse("Dear UPI user A/C X1234 debited by 1.0 on date 23Oct26 trf to MATHEN Refno 507743921781. If not u? call 1800111109. -SBI"),
        "1.00", Direction.DEBIT,
    )

    @Test fun iciciDebitWinsOverLaterCredited() = assertHit(
        parse("Acct XX123 debited for Rs 1.00 on 23-Oct-26; MATHEN credited. UPI:507743921781"),
        "1.00", Direction.DEBIT,
    )

    @Test fun axisPathForm() = assertHit(
        parse("INR 1.00 debited A/c no. XX1234 23-10-26, 01:23:10 UPI/P2A/507743921781/MATHEN Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank"),
        "1.00", Direction.DEBIT,
    )

    @Test fun kotak() = assertHit(
        parse("Sent Rs.1.00 from Kotak Bank AC X1234 to sanjay@okicici on 23-10-26.UPI Ref 507743921781. Not you, https://kotak.com/KBANKT/Fraud"),
        "1.00", Direction.DEBIT,
    )

    @Test fun credit() = assertHit(
        parse("Rs.500.00 credited to A/c XX1234 on 23-10-26 by VPA x@ybl (UPI Ref No 507743921799)"),
        "500.00", Direction.CREDIT, "507743921799",
    )

    @Test fun titleAndTextAreCombined() = assertHit(
        parse(title = "Paid ₹1,250.50", text = "UPI Ref No: 507743921781", pkg = gpay),
        "1250.50", Direction.DEBIT,
    )

    @Test fun bankCreditedByWithoutCurrencySign() = assertHit(
        parse("A/C X1234 credited by 500 on 23Oct26 Ref no. 507743921781"),
        "500.00", Direction.CREDIT,
    )

    @Test fun firstCurrencyPrefixedAmountWins() = assertHit(
        parse("Rs 2.00 debited; bal Rs 900.00 UTR 507743921781"),
        "2.00", Direction.DEBIT,
    )

    @Test fun unknownDirection() = assertHit(
        parse("Txn of INR 7 RRN: 507743921781"), "7.00", Direction.UNKNOWN,
    )

    @Test fun zeroAmountIgnored() = assertNull(parse("Rs 0.00 debited UPI Ref 507743921781"))

    @Test fun noRefMeansNull() {
        assertNull(parse("₹1 paid to Sanjay Mathew"))
        assertNull(parse("123456 is your OTP for txn of Rs 1.00 at SHOP. Do not share. Call 9876543210"))
    }

    @Test fun unlabelledTwelveDigitsRejected() {
        assertNull(parse("Rs 1.00 debited. Phone 919951860002"))
        assertNull(parse("Rs 1.00 debited from A/c 507743921781"))
    }

    @Test fun wrongDigitCountRejected() {
        assertNull(parse("Rs 1.00 debited Ref 50774392178"))
        assertNull(parse("Rs 1.00 debited Ref 5077439217811"))
    }

    @Test fun refWithoutAmountIsNull() = assertNull(parse("Payment done. UPI Ref 507743921781"))

    @Test fun promoAndBlankInputs() {
        assertNull(parse("Get 10% cashback up to Rs 100 on your next recharge!"))
        assertNull(parse(null))
        assertNull(parse("   ", title = ""))
        assertNull(NotificationParser.parse(sms, null, null, 0L))
    }
}
