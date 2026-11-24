package com.automationforge.v4

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object ForgeNotifications {
    private const val CHANNEL = "forge_workflows"
    fun show(context: Context, message: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Forge workflow alerts", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(context, CHANNEL)
        } else Notification.Builder(context)
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Automation Forge")
            .setContentText(message.take(180))
            .setAutoCancel(true)
        val notification = builder.build()
        nm.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}
