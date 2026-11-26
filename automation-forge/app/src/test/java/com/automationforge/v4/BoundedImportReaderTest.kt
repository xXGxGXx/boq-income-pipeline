package com.automationforge.v4

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream

class BoundedImportReaderTest {
    @Test fun acceptsEmptyInput() {
        assertEquals("", BoundedImportReader.readUtf8(ByteArrayInputStream(byteArrayOf())))
    }

    @Test fun acceptsExactlyTheByteLimit() {
        val input = ByteArray(BoundedImportReader.MAX_BYTES) { 'a'.code.toByte() }
        assertEquals(BoundedImportReader.MAX_BYTES, BoundedImportReader.readUtf8(ByteArrayInputStream(input)).length)
    }

    @Test fun rejectsLimitPlusOneByte() {
        val input = ByteArray(BoundedImportReader.MAX_BYTES + 1) { 'a'.code.toByte() }
        assertThrows(IllegalArgumentException::class.java) {
            BoundedImportReader.readUtf8(ByteArrayInputStream(input))
        }
    }

    @Test fun limitIsMeasuredInBytesNotCharacters() {
        val utf8 = "é".repeat(5).toByteArray(Charsets.UTF_8)
        assertEquals("é".repeat(5), BoundedImportReader.readUtf8(ByteArrayInputStream(utf8), 10))
        assertThrows(IllegalArgumentException::class.java) {
            BoundedImportReader.readUtf8(ByteArrayInputStream(utf8), 9)
        }
    }

    @Test fun rejectsNegativeLimit() {
        assertThrows(IllegalArgumentException::class.java) {
            BoundedImportReader.readUtf8(ByteArrayInputStream(byteArrayOf()), -1)
        }
    }
}
