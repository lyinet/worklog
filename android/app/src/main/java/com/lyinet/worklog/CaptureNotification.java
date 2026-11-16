package com.lyinet.worklog;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

final class CaptureNotification {
    static final String CHANNEL_ID = "quick_capture";
    private static final int NOTIFICATION_ID = 1200;
    private static final String PREFERENCES = "capture_notification";

    private CaptureNotification() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return preferences(context).getBoolean("enabled", false);
    }

    static void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean("enabled", enabled).apply();
    }

    static boolean hasRequestedPermission(Context context) {
        return preferences(context).getBoolean("permission_requested", false);
    }

    static void markPermissionRequested(Context context) {
        preferences(context).edit().putBoolean("permission_requested", true).apply();
    }

    static boolean hasRuntimePermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    static boolean canPost(Context context) {
        if (!hasRuntimePermission(context)
            || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }

    static void sync(Context context) {
        NotificationManagerCompat notifications = NotificationManagerCompat.from(context);
        if (!isEnabled(context) || !canPost(context)) {
            notifications.cancel(NOTIFICATION_ID);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "通知栏快捷记录", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("点一下进入记录，不响铃、不震动");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("focusCapture", true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent capture = PendingIntent.getActivity(
            context, NOTIFICATION_ID, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_capture)
            .setContentTitle("工作簿")
            .setContentText("点一下记一笔")
            .setContentIntent(capture)
            .addAction(R.drawable.ic_notification_capture, "记一笔", capture)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        try {
            notifications.notify(NOTIFICATION_ID, notification.build());
        } catch (SecurityException ignored) {
            notifications.cancel(NOTIFICATION_ID);
        }
    }
}
