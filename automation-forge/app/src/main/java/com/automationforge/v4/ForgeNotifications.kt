package com.automationforge.v4

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object ForgeNotifications {
    private const val CHANNEL = "forge_workflows"

    private fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun ensureChannel(nm: NotificationManager) {
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Forge workflow alerts", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    fun permissionGranted(context: Context): Boolean =
        Build.VERSION.SDK_INT < NotificationGate.PERMISSION_SDK ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Whether a notification could be shown right now, and if not, why. */
    fun status(context: Context): NotifyBlock {
        val nm = manager(context)
        ensureChannel(nm)                                   // creating it again is a no-op and keeps the user's choice
        val channelBlocked = Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE
        return NotificationGate.decide(Build.VERSION.SDK_INT, permissionGranted(context), nm.areNotificationsEnabled(), channelBlocked)
    }

    /** Shows the notification when Android allows it. Returns NONE if shown, otherwise the reason it wasn't. */
    fun show(context: Context, message: String): NotifyBlock {
        val block = status(context)
        if (block != NotifyBlock.NONE) return block         // posting anyway would be silently dropped
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(context)
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Automation Forge")
            .setContentText(message.take(180))
            .setAutoCancel(true)
        manager(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), builder.build())
        return NotifyBlock.NONE
    }
}
