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
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;

final class CaptureNotification {
    static final String CHANNEL_ID = "quick_capture";
    static final String ACTION_REPLY = "com.lyinet.worklog.CAPTURE_REPLY";
    static final String ACTION_PENDING_CHANGED = "com.lyinet.worklog.CAPTURE_PENDING_CHANGED";
    static final String REPLY_KEY = "capture_text";
    private static final int NOTIFICATION_ID = 1200;

    private CaptureNotification() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(CaptureNotificationQueue.PREFERENCES, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return preferences(context).getBoolean("enabled", false);
    }

    static synchronized void setEnabled(Context context, boolean enabled) {
        CaptureNotificationQueue.setEnabled(context, enabled);
        sync(context);
    }

    static synchronized void recordReply(Context context, String text, long createdAt) {
        CaptureNotificationQueue.append(context, text, createdAt);
        sync(context);
    }

    static synchronized CaptureNotificationQueue.DrainResult drainPending(Context context, String owner) {
        return CaptureNotificationQueue.drain(context, owner);
    }

    static synchronized void acknowledgePending(Context context, String owner, JSONArray ids) {
        CaptureNotificationQueue.acknowledge(context, owner, ids);
        sync(context);
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

    static synchronized void sync(Context context) {
        sync(context, null);
    }

    static synchronized void sync(Context context, String failure) {
        NotificationManagerCompat notifications = NotificationManagerCompat.from(context);
        if (!isEnabled(context) || !canPost(context)) {
            notifications.cancel(NOTIFICATION_ID);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "通知栏快捷记录", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("直接回复记一笔，不响铃、不震动");
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
        Intent replyIntent = new Intent(context, CaptureNotificationReceiver.class).setAction(ACTION_REPLY);
        int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) replyFlags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent reply = PendingIntent.getBroadcast(context, NOTIFICATION_ID + 1, replyIntent, replyFlags);
        RemoteInput input = new RemoteInput.Builder(REPLY_KEY).setLabel("刚做了什么？").build();
        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
            R.drawable.ic_notification_capture, "记一笔", reply
        ).addRemoteInput(input).setAllowGeneratedReplies(false)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false).build();
        int count = CaptureNotificationQueue.count(context);
        String text = count > 0 ? "已记下 " + count + " 条，打开工作簿即入库" : "直接回复记一笔，点此打开工作簿";
        long dropped = CaptureNotificationQueue.dropped(context);
        if (dropped > 0) text += "；队列已满，已丢弃最旧 " + dropped + " 条";
        if (failure != null) text = failure;
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_capture)
            .setContentTitle("工作簿")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(capture)
            .addAction(replyAction)
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
