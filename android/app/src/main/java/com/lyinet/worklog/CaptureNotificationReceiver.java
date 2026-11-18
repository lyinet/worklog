package com.lyinet.worklog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.RemoteInput;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CaptureNotificationReceiver extends BroadcastReceiver {
    private static final ExecutorService REPLIES = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (CaptureNotification.ACTION_REPLY.equals(intent.getAction())) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence text = results == null ? null : results.getCharSequence(CaptureNotification.REPLY_KEY);
            if (text == null) return;
            long createdAt = System.currentTimeMillis();
            String reply = text.toString();
            PendingResult pending = goAsync();
            REPLIES.execute(() -> {
                try {
                    CaptureNotification.recordReply(context, reply, createdAt);
                    context.sendBroadcast(new Intent(CaptureNotification.ACTION_PENDING_CHANGED)
                        .setPackage(context.getPackageName()));
                } catch (RuntimeException cause) {
                    Log.e("CaptureNotification", "通知记录保存失败", cause);
                    try {
                        CaptureNotification.sync(context, "未能保存，请打开工作簿重记");
                    } catch (RuntimeException notificationFailure) {
                        Log.e("CaptureNotification", "通知反馈失败", notificationFailure);
                    }
                } finally {
                    pending.finish();
                }
            });
            return;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            CaptureNotification.sync(context);
        }
    }
}
