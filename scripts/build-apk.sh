#!/usr/bin/env bash
# 一条命令构建 debug APK。缺工具链会直接告诉你缺什么。
set -euo pipefail

cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$JAVA_HOME" ]; then
  echo "缺少 JDK 21。装：brew install openjdk@21" >&2
  echo "或者设置 JAVA_HOME 指向已有 JDK。" >&2
  exit 1
fi

if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "缺少 Android SDK。装：brew install --cask android-commandlinetools" >&2
  echo "然后：sdkmanager \"platform-tools\" \"platforms;android-36\" \"build-tools;36.0.0\"" >&2
  exit 1
fi

echo "==> 构建 Web 产物"
pnpm build

echo "==> 同步到 Capacitor"
npx cap sync android

echo "==> Gradle 打包"
cd android
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo
echo "APK: $(pwd)/$APK  ($(du -h "$APK" | cut -f1))"
echo "装到手机：adb install -r $(pwd)/$APK"
