package com.automationforge.v4

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.InetAddress

class ForgePolicyTest {
    private fun v4(vararg b: Int) = InetAddress.getByAddress(ByteArray(4) { b[it].toByte() })
    private fun v6(text: String) = InetAddress.getByName(text)          // IPv6 literals parse without any DNS lookup

    @Test fun acceptsPublicHttpsHostNames() {
        assertNull(ForgePolicy.webhookUrlProblem("https://hooks.example.com/forge"))
        assertNull(ForgePolicy.webhookUrlProblem("https://api.example.org:8443/v1/hook?x=1"))
    }

    @Test fun refusesWhatTheOriginalScreeningLetThrough() {
        for (url in listOf("https://[fd00::1]/x", "https://[fe80::1]/x", "https://[::ffff:192.168.1.1]/x",   // IPv6 literals (v4.2 only blocked ::1)
                           "https://router.local/x", "https://nas.lan/x", "https://printer.internal/x", "https://router/x", "https://foo.localhost/x")) {
            assertNotNull(url, ForgePolicy.webhookUrlProblem(url))
        }
    }

    @Test fun stillRefusesWhatTheOriginalRefused() {
        for (url in listOf("http://hooks.example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x",
                           "https://192.168.1.1/x", "https://user:pass@hooks.example.com/x", "not a url", "https:///nohost")) {
            assertNotNull(url, ForgePolicy.webhookUrlProblem(url))
        }
    }

    @Test fun onlyPublicAddressesPass() {
        assertTrue(ForgePolicy.isPublicAddress(v4(93, 184, 215, 14)))
        assertTrue(ForgePolicy.isPublicAddress(v6("2606:4700:4700::1111")))
        val private = listOf(v4(10, 0, 0, 1), v4(172, 16, 0, 1), v4(192, 168, 1, 1), v4(127, 0, 0, 1), v4(169, 254, 169, 254), v4(100, 64, 0, 1),
                             v4(0, 0, 0, 0), v4(255, 255, 255, 255), v4(198, 18, 0, 1), v6("::1"), v6("fd00::1"), v6("fe80::1"), v6("::ffff:192.168.1.1"))
        for (a in private) assertFalse(a.hostAddress, ForgePolicy.isPublicAddress(a))
    }

    @Test fun permanentErrorsAreNotRetried() {
        assertTrue(ForgePolicy.isPermanent(WebhookHttpException(404)))
        assertTrue(ForgePolicy.isPermanent(WebhookHttpException(302)))      // redirects are refused, so retrying won't help
        assertTrue(ForgePolicy.isPermanent(PermanentStepException("Unsupported step: x")))
        assertTrue(ForgePolicy.isPermanent(org.json.JSONException("bad json")))
        assertFalse(ForgePolicy.isPermanent(WebhookHttpException(500)))
        assertFalse(ForgePolicy.isPermanent(WebhookHttpException(429)))
        assertFalse(ForgePolicy.isPermanent(WebhookHttpException(408)))
        assertFalse(ForgePolicy.isPermanent(IOException("network down")))
    }

    @Test fun transientErrorsRetryAFewTimesOnly() {
        assertTrue(ForgePolicy.shouldRetry(IOException("timeout"), 0))
        assertTrue(ForgePolicy.shouldRetry(IOException("timeout"), ForgePolicy.MAX_ATTEMPTS - 2))
        assertFalse(ForgePolicy.shouldRetry(IOException("timeout"), ForgePolicy.MAX_ATTEMPTS - 1))
        assertFalse(ForgePolicy.shouldRetry(WebhookHttpException(404), 0))
    }

    @Test fun delayBudgetFitsOneBackgroundRun() {
        assertEquals(480, ForgePolicy.totalDelaySeconds(List(8) { 60 }))
        assertTrue(ForgePolicy.totalDelaySeconds(List(30) { 60 }) > ForgePolicy.MAX_TOTAL_DELAY_SECONDS)   // what v4.2 allowed: 30 minutes
        assertEquals(61, ForgePolicy.totalDelaySeconds(listOf(100, 0)))                                    // each delay is clamped to 1..60
    }
}
