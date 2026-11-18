package com.lyinet.worklog;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "CaptureNotification",
    permissions = @Permission(alias = "notifications", strings = Manifest.permission.POST_NOTIFICATIONS)
)
public class CaptureNotificationPlugin extends Plugin {
    private String pendingOwner;
    private final BroadcastReceiver pendingChanged = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            notifyListeners("pendingChanged", new JSObject());
        }
    };

    @Override
    public void load() {
        ContextCompat.registerReceiver(getContext(), pendingChanged,
            new IntentFilter(CaptureNotification.ACTION_PENDING_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED);
        CaptureNotification.sync(getContext());
    }

    private JSObject status() {
        JSObject result = new JSObject();
        result.put("enabled", CaptureNotification.isEnabled(getContext()));
        String permission = CaptureNotification.canPost(getContext()) ? "granted" : "denied";
        if (!CaptureNotification.hasRuntimePermission(getContext())
            && !CaptureNotification.hasRequestedPermission(getContext())) {
            permission = "prompt";
        }
        result.put("permission", permission);
        return result;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                CaptureNotification.sync(getContext());
                call.resolve(status());
            } catch (RuntimeException cause) {
                call.reject("通知状态读取失败，请重新打开菜单", cause);
            }
        });
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("缺少开关状态");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                CaptureNotification.setEnabled(getContext(), enabled);
                notifyListeners("statusChanged", status());
                if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && !CaptureNotification.hasRuntimePermission(getContext())
                    && !CaptureNotification.hasRequestedPermission(getContext())) {
                    CaptureNotification.markPermissionRequested(getContext());
                    requestPermissionForAlias("notifications", call, "notificationPermissionResult");
                    return;
                }
                CaptureNotification.sync(getContext());
                call.resolve(status());
            } catch (RuntimeException cause) {
                call.reject("通知设置失败，请重试", cause);
            }
        });
    }

    @PluginMethod
    public void drainPending(PluginCall call) {
        String owner = call.getString("owner");
        if (owner == null || owner.isEmpty()) {
            call.reject("缺少通知记录会话编号");
            return;
        }
        try {
            if (pendingOwner != null && !pendingOwner.equals(owner)) {
                call.reject("另一个工作簿页面正在处理通知记录");
                return;
            }
            pendingOwner = owner;
            JSObject result = new JSObject();
            CaptureNotificationQueue.DrainResult batch = CaptureNotification.drainPending(getContext(), owner);
            result.put("entries", new JSArray(batch.entries.toString()));
            result.put("dropped", batch.dropped);
            call.resolve(result);
        } catch (Exception cause) {
            call.reject("通知记录读取失败，请重新打开工作簿", cause);
        }
    }

    @PluginMethod
    public void acknowledgePending(PluginCall call) {
        JSArray ids = call.getArray("ids");
        String owner = call.getString("owner");
        if (ids == null || owner == null) {
            call.reject("缺少通知记录编号");
            return;
        }
        try {
            CaptureNotification.acknowledgePending(getContext(), owner, ids);
            call.resolve();
        } catch (RuntimeException cause) {
            call.reject("通知记录确认失败，将在下次打开时重试", cause);
        }
    }

    @Override
    protected void handleOnDestroy() {
        getContext().unregisterReceiver(pendingChanged);
        if (pendingOwner != null) CaptureNotificationQueue.release(pendingOwner);
    }

    @PluginMethod
    public void releasePending(PluginCall call) {
        String owner = call.getString("owner");
        if (owner == null || owner.isEmpty()) {
            call.reject("缺少通知记录会话编号");
            return;
        }
        CaptureNotificationQueue.release(owner);
        if (owner.equals(pendingOwner)) pendingOwner = null;
        call.resolve();
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        CaptureNotification.sync(getContext());
        if (call != null) {
            call.resolve(status());
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (RuntimeException cause) {
                call.reject("请手动前往系统设置，允许工作簿通知", cause);
            }
        });
    }

    @Override
    protected void handleOnResume() {
        CaptureNotification.sync(getContext());
        notifyListeners("statusChanged", status());
    }
}
