package com.lyinet.worklog;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate()（内部会调 load()）之前改好起始 URL，
        // 因为 Bridge 在构造时就把 appUrl 定死了，之后改配置不会再生效。
        if (getIntent().getBooleanExtra("focusCapture", false)) {
            config = new CapConfig.Builder(this)
                .setStartPath("/?focus=capture")
                .create();
        }
        super.onCreate(savedInstanceState);
    }
}
