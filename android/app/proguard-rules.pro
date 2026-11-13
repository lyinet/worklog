# Capacitor 通过反射和注解加载插件、注入 JS，R8 不能裁掉这些入口。
# 前端资源在 assets/public，不属于 Android res，shrinkResources 不会动它；
# 这些规则保证原生桥接层在 minify 后仍然可用。

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class com.getcapacitor.annotation.** { *; }

# 所有 Plugin 子类及其 @PluginMethod 方法
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# @JavascriptInterface 暴露给 WebView 的方法
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova 兼容层（capacitor-cordova-android-plugins）
-keep class org.apache.cordova.** { *; }

# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
