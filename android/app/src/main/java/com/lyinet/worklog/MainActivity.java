package com.lyinet.worklog;

import android.content.Context;
import android.os.Bundle;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {

    /**
     * 从桌面小部件点进来时带上 focusCapture=true。
     *
     * 这里做两件事：
     * 1. 把起始 URL 改成 /?focus=capture（必须在 super.onCreate 之前，Bridge 构造时
     *    就把 appUrl 定死了）。Web 端据此 focus 输入框。
     * 2. 额外把 WebView 的窗口焦点抢过来。只靠页面里的 input.focus() 是不够的：
     *    实测 document.activeElement 是输入框，但 document.hasFocus() 为 false，
     *    输入法不会响应。requestFocus() + showSoftInput() 才能真正弹出键盘。
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        boolean focusCapture = getIntent().getBooleanExtra("focusCapture", false);
        if (focusCapture) {
            config = new CapConfig.Builder(this)
                .setStartPath("/?focus=capture")
                .create();
        }
        registerPlugin(CaptureNotificationPlugin.class);
        super.onCreate(savedInstanceState);

        if (focusCapture) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                // 等 WebView 完成首次布局并建立输入连接，太早调用会被系统丢弃。
                webView.postDelayed(() -> {
                    webView.requestFocus();
                    InputMethodManager imm =
                        (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) {
                        imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
                    }
                }, 700L);
            }
        }
    }
}
