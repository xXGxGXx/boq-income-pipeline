package com.automationforge.v4

/** Why a notification can't be shown right now (NONE means it can). */
enum class NotifyBlock { NONE, PERMISSION, APP_SETTING, CHANNEL }

/** What the "Allow notifications" button should do. */
enum class NotifyAction { NONE, REQUEST_PERMISSION, OPEN_SETTINGS }

/**
 * Notification decisions, kept free of Android classes so they run in plain JVM unit tests.
 * Android 13 (API 33) and later need the POST_NOTIFICATIONS runtime permission; on every version the user can also
 * turn the app's notifications, or just its channel, off in system settings.
 */
object NotificationGate {
    const val PERMISSION_SDK = 33

    fun decide(sdkInt: Int, permissionGranted: Boolean, appNotificationsEnabled: Boolean, channelBlocked: Boolean): NotifyBlock = when {
        sdkInt >= PERMISSION_SDK && !permissionGranted -> NotifyBlock.PERMISSION
        !appNotificationsEnabled -> NotifyBlock.APP_SETTING
        channelBlocked -> NotifyBlock.CHANNEL
        else -> NotifyBlock.NONE
    }

    /** Ask once, on first launch, and only where the runtime permission exists and isn't granted yet. */
    fun shouldAskAtLaunch(sdkInt: Int, permissionGranted: Boolean, askedBefore: Boolean): Boolean =
        sdkInt >= PERMISSION_SDK && !permissionGranted && !askedBefore

    /**
     * The system shows the permission dialog only while it is still allowed to: before the first request, or while
     * shouldShowRequestPermissionRationale is true. After that, only the app's notification settings can change it.
     */
    fun nextAction(sdkInt: Int, block: NotifyBlock, askedBefore: Boolean, showRationale: Boolean): NotifyAction = when {
        block == NotifyBlock.NONE -> NotifyAction.NONE
        block == NotifyBlock.PERMISSION && sdkInt >= PERMISSION_SDK && (!askedBefore || showRationale) -> NotifyAction.REQUEST_PERMISSION
        else -> NotifyAction.OPEN_SETTINGS
    }

    /** Plain-language reason, used in the execution history and the panel. Never claims delivery when blocked. */
    fun message(block: NotifyBlock): String = when (block) {
        NotifyBlock.NONE -> "Notifications are on."
        NotifyBlock.PERMISSION -> "Notifications are off: Automation Forge hasn't been allowed to send notifications (Android 13 and later ask for permission)."
        NotifyBlock.APP_SETTING -> "Notifications are off for Automation Forge in Android settings."
        NotifyBlock.CHANNEL -> "The \"Forge workflow alerts\" notification category is turned off in Android settings."
    }

    /** History entry for a notify step: an event name and detail that say plainly whether anything was shown. */
    fun historyEntry(block: NotifyBlock): Pair<String, String> =
        if (block == NotifyBlock.NONE) "NOTIFIED" to "Notification shown"
        else "NOTIFY_BLOCKED" to "Notification not shown. " + message(block)
}
