package com.automationforge.v4

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.charset.StandardCharsets

/**
 * Reads UTF-8 imports with a hard byte cap. The cap is enforced while streaming,
 * before the complete file can be allocated or decoded.
 */
object BoundedImportReader {
    const val MAX_BYTES = 1_000_000

    fun readUtf8(input: InputStream, maxBytes: Int = MAX_BYTES): String {
        require(maxBytes >= 0) { "Maximum size must be non-negative" }
        val output = ByteArrayOutputStream(minOf(maxBytes, 8192))
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
            val remaining = maxBytes - total
            val readLimit = minOf(buffer.size, remaining + 1)
            val count = input.read(buffer, 0, readLimit)
            if (count < 0) break
            if (total + count > maxBytes) {
                throw IllegalArgumentException("File exceeds ${maxBytes} byte import limit")
            }
            output.write(buffer, 0, count)
            total += count
        }
        return String(output.toByteArray(), StandardCharsets.UTF_8)
    }
}
