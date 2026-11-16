#!/usr/bin/env bash
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

BUILD_TOOLS="$ANDROID_HOME/build-tools/36.0.0"
for TOOL in apksigner aapt2; do
  if [ ! -x "$BUILD_TOOLS/$TOOL" ]; then
    echo "缺少 Android 工具：$BUILD_TOOLS/$TOOL" >&2
    echo "安装：sdkmanager \"build-tools;36.0.0\"，或设置 ANDROID_HOME。" >&2
    exit 1
  fi
done

if [ ! -f android/keystore.properties ]; then
  echo "缺少 android/keystore.properties。请按 docs/RELEASE.md 配置发布签名。" >&2
  exit 1
fi

CHECK_DIR="$(mktemp -d)"
trap 'rm -rf "$CHECK_DIR"' EXIT
cat > "$CHECK_DIR/ReleaseSigningCheck.java" <<'JAVA'
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

class ReleaseSigningCheck {
    public static void main(String[] args) {
        try {
            var properties = new Properties();
            try (var input = Files.newInputStream(Path.of("android/keystore.properties"))) {
                properties.load(input);
            }
            for (var key : new String[]{"storeFile", "storePassword", "keyAlias", "keyPassword"}) {
                if (properties.getProperty(key, "").isEmpty()) {
                    System.err.println("android/keystore.properties 缺少字段：" + key + "。请看 docs/RELEASE.md。");
                    System.exit(1);
                }
            }
            var storeFile = Path.of(properties.getProperty("storeFile"));
            if (!storeFile.isAbsolute()) storeFile = Path.of("android").resolve(storeFile);
            if (!Files.isRegularFile(storeFile) || !Files.isReadable(storeFile)) {
                System.err.println("keystore 文件不存在或不可读：" + storeFile + "。请看 docs/RELEASE.md。");
                System.exit(1);
            }
        } catch (Exception error) {
            System.err.println("无法读取发布签名配置，请检查 android/keystore.properties，详见 docs/RELEASE.md。");
            System.exit(1);
        }
    }
}
JAVA
"$JAVA_HOME/bin/java" -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 "$CHECK_DIR/ReleaseSigningCheck.java"

echo "==> 构建 Web 产物"
pnpm build

echo "==> 同步到 Capacitor"
npx cap sync android

echo "==> Gradle 打包"
cd android
./gradlew assembleRelease

APK="$(pwd)/app/build/outputs/apk/release/app-release.apk"
echo "==> 校验发布签名"
"$BUILD_TOOLS/apksigner" verify --verbose --print-certs "$APK"
echo "签名校验通过"

BADGING="$("$BUILD_TOOLS/aapt2" dump badging "$APK")"
VERSION_NAME="$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p")"
VERSION_CODE="$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionCode='\([^']*\)'.*/\1/p")"
if [ -z "$VERSION_NAME" ] || [ -z "$VERSION_CODE" ]; then
  echo "无法读取 APK 版本信息，请检查构建产物。" >&2
  exit 1
fi

echo
echo "APK: $APK"
echo "文件大小: $(wc -c < "$APK" | tr -d '[:space:]') 字节 ($(du -h "$APK" | cut -f1))"
echo "versionName: $VERSION_NAME"
echo "versionCode: $VERSION_CODE"
