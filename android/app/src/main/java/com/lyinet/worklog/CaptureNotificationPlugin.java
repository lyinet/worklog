package com.lyinet.worklog;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
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
    @Override
    public void load() {
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
