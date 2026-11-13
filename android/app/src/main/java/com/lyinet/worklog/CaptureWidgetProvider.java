package com.lyinet.worklog;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** 桌面 2x1 卡片：点一下打开 App，并让记录输入框聚焦。 */
public class CaptureWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            // 不走 singleTask 复用：点卡片时强制重建 Activity，才会重新读 focusCapture。
            Intent intent = new Intent(context, MainActivity.class);
            intent.putExtra("focusCapture", true);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            // 每个部件用自己的 id 做 requestCode，FLAG_UPDATE_CURRENT 保证 extra 是最新的。
            PendingIntent pending = PendingIntent.getActivity(
                context,
                appWidgetId,
                intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_capture);
            views.setOnClickPendingIntent(R.id.widget_capture, pending);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
