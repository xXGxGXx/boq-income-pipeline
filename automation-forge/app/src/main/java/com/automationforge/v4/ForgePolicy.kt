package com.automationforge.v4

import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI

/** Webhook replied with an HTTP status outside 2xx. */
class WebhookHttpException(val code: Int) : IOException("Webhook returned HTTP $code")

/** A workflow step that can never succeed as written; retrying it would only repeat earlier side effects. */
class PermanentStepException(message: String) : Exception(message)

/**
 * The decisions the worker and the bridge make, kept free of Android classes so they run in plain JVM unit tests.
 */
object ForgePolicy {
    /** WorkManager stops a background run after about 10 minutes; keep a whole workflow's waits well inside that. */
    const val MAX_TOTAL_DELAY_SECONDS = 480
    const val MAX_ATTEMPTS = 5

    private val localNames = setOf("localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback")
    private val localSuffixes = listOf(".localhost", ".local", ".lan", ".internal", ".home.arpa", ".intranet", ".corp")
    private val ipv4Literal = Regex("""^\d{1,3}(\.\d{1,3}){3}$""")

    /** null when the URL may be used as a webhook, otherwise the reason it may not. */
    fun webhookUrlProblem(url: String): String? {
        val uri = try { URI(url.trim()) } catch (e: Exception) { return "Webhook URL is not a valid address" }
        if (uri.scheme?.lowercase() != "https") return "Webhook must use HTTPS"
        if (uri.rawUserInfo != null) return "Webhook URL must not contain a user name or password"
        val host = (uri.host ?: "").lowercase().trimEnd('.')
        if (host.isBlank()) return "Webhook URL needs a host name"
        if (host.startsWith("[") || host.contains(':') || ipv4Literal.matches(host)) return "Webhook must use a public host name, not an IP address"
        if (host in localNames || localSuffixes.any { host.endsWith(it) } || !host.contains('.')) return "Webhook must use a public host name (no local or single-label names)"
        return null
    }

    /** true only for addresses on the public internet: never this device, the home network, link-local or carrier-NAT ranges. */
    fun isPublicAddress(addr: InetAddress): Boolean {
        if (addr.isLoopbackAddress || addr.isAnyLocalAddress || addr.isLinkLocalAddress || addr.isSiteLocalAddress || addr.isMulticastAddress) return false
        val b = addr.address
        if (addr is Inet4Address) {
            val a0 = b[0].toInt() and 0xff; val a1 = b[1].toInt() and 0xff
            if (a0 == 0 || a0 >= 240) return false                          // "this network", reserved, broadcast
            if (a0 == 100 && a1 in 64..127) return false                     // carrier-grade NAT 100.64.0.0/10
            if (a0 == 192 && a1 == 0 && (b[2].toInt() and 0xff) == 0) return false   // 192.0.0.0/24 protocol assignments
            if (a0 == 198 && (a1 == 18 || a1 == 19)) return false            // benchmarking 198.18.0.0/15
        }
        if (addr is Inet6Address) {
            val first = b[0].toInt() and 0xff
            if (first and 0xfe == 0xfc) return false                         // unique local fc00::/7
            val mapped = b.take(10).all { it.toInt() == 0 } && (b[10].toInt() and 0xff) == 0xff && (b[11].toInt() and 0xff) == 0xff
            if (mapped) return isPublicAddress(InetAddress.getByAddress(b.copyOfRange(12, 16)))   // ::ffff:a.b.c.d
        }
        return true
    }

    /** Problems that retrying can't fix: bad steps, refused URLs, and HTTP 4xx other than timeout and rate limit. */
    fun isPermanent(e: Throwable): Boolean = when (e) {
        is PermanentStepException, is IllegalArgumentException, is org.json.JSONException -> true
        is WebhookHttpException -> e.code in 300..499 && e.code != 408 && e.code != 429
        else -> false
    }

    /** Retry only transient problems, and only a few times, so a broken workflow can't repeat its side effects forever. */
    fun shouldRetry(e: Throwable, attempt: Int): Boolean = !isPermanent(e) && attempt + 1 < MAX_ATTEMPTS

    /** Seconds of waiting a workflow asks for in one run (delays are capped at 60 s each, as the bridge does). */
    fun totalDelaySeconds(delays: List<Int>): Int = delays.sumOf { it.coerceIn(1, 60) }
}
