package com.automationforge.v4

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationGateTest {
    @Test fun android13NeedsTheRuntimePermission() {
        assertEquals(NotifyBlock.PERMISSION, NotificationGate.decide(33, permissionGranted = false, appNotificationsEnabled = false, channelBlocked = false))
        assertEquals(NotifyBlock.PERMISSION, NotificationGate.decide(35, permissionGranted = false, appNotificationsEnabled = true, channelBlocked = false))
        assertEquals(NotifyBlock.NONE, NotificationGate.decide(33, permissionGranted = true, appNotificationsEnabled = true, channelBlocked = false))
    }

    @Test fun olderAndroidHasNoRuntimePermissionButSettingsStillApply() {
        assertEquals(NotifyBlock.NONE, NotificationGate.decide(32, permissionGranted = false, appNotificationsEnabled = true, channelBlocked = false))
        assertEquals(NotifyBlock.APP_SETTING, NotificationGate.decide(26, permissionGranted = false, appNotificationsEnabled = false, channelBlocked = false))
        assertEquals(NotifyBlock.CHANNEL, NotificationGate.decide(30, permissionGranted = true, appNotificationsEnabled = true, channelBlocked = true))
    }

    @Test fun grantedButSwitchedOffInSettingsIsStillBlocked() {
        assertEquals(NotifyBlock.APP_SETTING, NotificationGate.decide(34, permissionGranted = true, appNotificationsEnabled = false, channelBlocked = false))
        assertEquals(NotifyBlock.CHANNEL, NotificationGate.decide(34, permissionGranted = true, appNotificationsEnabled = true, channelBlocked = true))
    }

    @Test fun asksOnceAtLaunchOnlyWhereThePermissionExists() {
        assertTrue(NotificationGate.shouldAskAtLaunch(33, permissionGranted = false, askedBefore = false))
        assertFalse(NotificationGate.shouldAskAtLaunch(33, permissionGranted = false, askedBefore = true))    // never nag
        assertFalse(NotificationGate.shouldAskAtLaunch(33, permissionGranted = true, askedBefore = false))
        assertFalse(NotificationGate.shouldAskAtLaunch(32, permissionGranted = false, askedBefore = false))   // nothing to ask for
    }

    @Test fun allowButtonRequestsWhileAndroidStillShowsTheDialogThenOpensSettings() {
        assertEquals(NotifyAction.REQUEST_PERMISSION, NotificationGate.nextAction(33, NotifyBlock.PERMISSION, askedBefore = false, showRationale = false))
        assertEquals(NotifyAction.REQUEST_PERMISSION, NotificationGate.nextAction(33, NotifyBlock.PERMISSION, askedBefore = true, showRationale = true))
        assertEquals(NotifyAction.OPEN_SETTINGS, NotificationGate.nextAction(33, NotifyBlock.PERMISSION, askedBefore = true, showRationale = false))  // denied for good
        assertEquals(NotifyAction.OPEN_SETTINGS, NotificationGate.nextAction(34, NotifyBlock.APP_SETTING, askedBefore = false, showRationale = false))
        assertEquals(NotifyAction.OPEN_SETTINGS, NotificationGate.nextAction(29, NotifyBlock.CHANNEL, askedBefore = false, showRationale = false))
        assertEquals(NotifyAction.NONE, NotificationGate.nextAction(33, NotifyBlock.NONE, askedBefore = true, showRationale = false))
    }

    @Test fun historyNeverClaimsDeliveryWhenBlocked() {
        assertEquals("NOTIFIED" to "Notification shown", NotificationGate.historyEntry(NotifyBlock.NONE))
        for (block in listOf(NotifyBlock.PERMISSION, NotifyBlock.APP_SETTING, NotifyBlock.CHANNEL)) {
            val (event, detail) = NotificationGate.historyEntry(block)
            assertEquals("NOTIFY_BLOCKED", event)
            assertTrue(detail, detail.startsWith("Notification not shown."))
            assertFalse(detail, detail.contains("Notification shown"))
        }
    }
}
