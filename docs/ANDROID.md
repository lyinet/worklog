# 安卓构建与安装

这个工程用 Capacitor 8 套壳：Vite 构建出的 `dist/` 会被拷进
`android/app/src/main/assets/public`，再由一个原生 WebView 加载。

当前原生工程的版本要求（来自 `android/variables.gradle` 和 Gradle wrapper）：

| 项目 | 版本 |
| --- | --- |
| JDK | 21 |
| compileSdk / targetSdk | 36 |
| minSdk | 24（Android 7.0） |
| Android Gradle Plugin | 8.13.0 |
| Gradle | 8.14.3 |
| Node.js | 22+ |
| Capacitor | 8.6.x |

整个环境不需要 Android Studio，也不需要模拟器。用命令行 SDK 就够了。

## 0. 先看磁盘

从零装完大概占这么多：

| 组件 | 大概占用 |
| --- | --- |
| Temurin JDK 21 | 300–400 MB |
| Android cmdline-tools | 100–200 MB |
| `platform-tools`（含 adb） | 20–40 MB |
| `platforms;android-36` | 100–200 MB |
| `build-tools;36.0.0` | 150–250 MB |
| Gradle 8.14.3 + 首次构建依赖缓存 | 1.5–2.5 GB |
| 本工程 `node_modules` + `dist` | 250–400 MB |
| 签名 keystore | 小于 10 KB |
| debug APK | 5–10 MB |

合计约 **2.5–4 GB**，建议至少留 10 GB 空闲。Gradle 缓存会越用越大。

## 1. 装 JDK 21

必须是 21。JDK 17 编不了 Java 21 目标，JDK 24/25 也可能和 AGP 8.13 打架。

macOS（Homebrew）：

```bash
brew install --cask temurin@21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
java -version   # 应显示 21.x
```

把 `JAVA_HOME` 写进 `~/.zshrc`，否则新终端里 Gradle 又找不到：

```bash
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 21)' >> ~/.zshrc
```

Linux（Ubuntu/Debian）：

```bash
sudo apt install openjdk-21-jdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
```

Windows：装 Temurin 21 后在「系统环境变量」里设 `JAVA_HOME`，并确认
`%JAVA_HOME%\bin\java.exe` 能跑。

验证：

```bash
echo "$JAVA_HOME"
"$JAVA_HOME/bin/java" -version
```

## 2. 装 Android SDK cmdline-tools

先定一个 SDK 目录。macOS 习惯用 `~/Library/Android/sdk`，Linux 常用
`~/Android/Sdk`。下面以 macOS 为例：

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
```

从 <https://developer.android.com/studio#command-line-tools-only> 下载
“Command line tools only” 的 zip（macOS 选 mac 包，Linux 选 linux 包），然后：

```bash
unzip commandlinetools-mac-*.zip -d /tmp/android-cmdline-tools
mv /tmp/android-cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
```

目录必须是 `cmdline-tools/latest/bin/sdkmanager`。如果解压后是
`cmdline-tools/cmdline-tools/bin/...`，`sdkmanager` 会报
“Could not determine SDK root”。

加 PATH：

```bash
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
sdkmanager --version
```

同样写进 `~/.zshrc`（或 `~/.bashrc`）：

```bash
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
echo 'export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.zshrc
```

## 3. 装 SDK 平台和 build-tools

```bash
sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --licenses   # 一路 y
```

版本不要自己降：`compileSdk` 和 `targetSdk` 都是 36，Capacitor 8 的 AAR 也按 36
编译。只装 34/35 会在构建时报找不到 `android-36`。

验证：

```bash
sdkmanager --list_installed
adb version
```

`adb` 来自 `platform-tools`，不在单独的 adb 包里。

## 4. 告诉 Gradle SDK 在哪

Gradle 会读 `ANDROID_HOME`，也可以写进 `android/local.properties`（已 gitignore，
只影响本机）：

```bash
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

这一步和 `JAVA_HOME` 是最常见的两个“构建起不来”的原因。

## 5. 构建 web 并同步进原生工程

```bash
pnpm install
pnpm android:build      # = pnpm build && cap sync android
```

同步成功的标志：

```bash
ls android/app/src/main/assets/public
# index.html  assets/  cordova.js  cordova_plugins.js
```

`android/` 已经提交进仓库，**不要**每次重新 `cap add android`。只有把它删了、
要从头生成时才跑：

```bash
pnpm android:add
pnpm android:sync
```

以后只改 web 代码：`pnpm android:build` 或 `pnpm build && pnpm android:sync`。
改了 `capacitor.config.ts` 也要重新 sync，原生端才会拿到新配置。

## 6. 生成签名（发布用）

只装到自己手机上，可以直接用 debug APK，系统会自动用
`~/.android/debug.keystore` 签名，跳过这一步。

要发布或长期升级，先生成一个 release keystore。**这个文件丢了就再也无法覆盖安装
升级，只能换包名重新上架**，务必单独备份：

```bash
mkdir -p "$HOME/keys"
keytool -genkeypair -v \
  -keystore "$HOME/keys/worklog-release.jks" \
  -alias worklog \
  -keyalg RSA -keysize 2048 -validity 10000
```

按提示设置密码和证书信息（姓名、组织可以随便填）。

然后在 `android/keystore.properties` 写密码（这个文件不要提交）：

```properties
storeFile=/Users/你/keys/worklog-release.jks
storePassword=你的密码
keyAlias=worklog
keyPassword=你的密码
```

在 `android/app/build.gradle` 里加签名配置（只加一次）：

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ...原有配置...
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            // ...原有配置...
        }
    }
}
```

并把 `android/keystore.properties` 和 `*.jks` 加进 `.gitignore`。

## 7. 编 APK

```bash
cd android
./gradlew assembleDebug
```

产物：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

发布包：

```bash
./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release.apk
```

首次构建会下载 Gradle 8.14.3（约 230 MB）和全部依赖，5–15 分钟很正常；
后面增量构建几十秒。`gradlew` 没有执行权限时先 `chmod +x gradlew`。

发新版前改 `android/app/build.gradle`：

```gradle
versionCode 2          // 每次必须 +1
versionName "1.1"      // 显示给用户
```

## 8. 装到手机

1. 手机「设置 → 关于手机」连点「版本号」7 次，打开开发者选项。
2. 开发者选项里打开「USB 调试」。
3. USB 连电脑，手机上点「允许 USB 调试」。

```bash
adb devices
# 应看到设备号 + device；unauthorized 表示还没在手机上点允许

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` 是覆盖安装并保留数据。装完在桌面找「工作簿」。

也可以把 APK 拷进手机，用文件管理器点击安装（需要允许「安装未知应用」）。

Android 11+ 无线调试：

```bash
adb pair 手机IP:配对端口    # 开发者选项 → 无线调试 → 使用配对码
adb connect 手机IP:调试端口
```

## 9. 日常改动流程

```bash
pnpm android:build
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- 只改 React/CSS：重新 `android:build` 再装即可。
- 改 `capacitor.config.ts`：`pnpm android:sync` 后重新编。
- 改原生主题/Manifest：直接重新 `./gradlew assembleDebug`。
- 装了 Android Studio 可以用 `pnpm android:open` 打开原生工程。

## 10. 常见坑

**JDK 版本不对**

- `Unsupported class file major version 65`、`invalid target release: 21`：
  当前不是 JDK 21。`java -version` 看 PATH，但 Gradle 优先看 `JAVA_HOME`，
  两个都要对。
- 同时装了多个 JDK 时，用 `/usr/libexec/java_home -V`（macOS）列出来再选 21。

**ANDROID_HOME 没配 / SDK 路径错**

- `SDK location not found. Define a valid SDK location with an ANDROID_HOME
  environment variable or by setting the sdk.dir path in your project's
  local.properties file`：按第 4 步写 `android/local.properties`。
- `Could not determine SDK root`：`cmdline-tools` 的目录层级不对，必须是
  `$ANDROID_HOME/cmdline-tools/latest/bin`。

**SDK 平台版本不匹配**

- `Failed to find target with hash string 'android-36'`：没装
  `platforms;android-36`，按第 3 步装。
- `Installed Build Tools revision 36.0.0 is corrupted`：删掉
  `$ANDROID_HOME/build-tools/36.0.0` 重装。
- 不要为了让旧 SDK 编过而改低 `compileSdk`；Capacitor 8 的依赖按 36 编译。

**license 没接受**

- `You have not accepted the license agreements`：跑 `sdkmanager --licenses`
  全部选 y。

**Gradle 下载慢或超时**

- 第一次构建需要联网拉 Gradle 和 Maven 依赖。国内网络可以配代理，或给
  Gradle 配镜像仓库；不要在没下完时反复删缓存。
- 失败后加 `--stacktrace` 看具体是哪一个依赖。

**adb 相关问题**

- `device unauthorized`：手机上没点允许，或换一根能传数据的 USB 线。
- Linux 上 `no permissions`：需要配 udev 规则，或临时用 `sudo adb`（不推荐）。
- 设备列表为空：`adb kill-server && adb devices` 重来。

**覆盖安装失败**

- `INSTALL_FAILED_UPDATE_INCOMPATIBLE`：新 APK 签名和已装的不同。先
  `adb uninstall com.lyinet.worklog` 再装。**卸载会清空 IndexedDB，先在 App 里
  导出 JSON 备份。**
- `INSTALL_FAILED_VERSION_DOWNGRADE`：把 `versionCode` 加 1。

**打开是白屏**

- 先确认 `pnpm build` 和 `cap sync android` 都跑过，`assets/public/index.html`
  存在。
- 手机上的 Android System WebView 太旧，去应用商店更新。
- 用 `adb logcat | grep -i -E "capacitor|chromium"` 看真实报错。

**数据丢了**

- IndexedDB 跟着包名走。换 `appId`、卸载重装都会清空。升级安装（`-r`）不会。
- 重要数据定期用「导出 JSON 备份」。

## 11. 当前安卓适配结论

这一节记录本次改造实际验证/判断的东西，改原生样式前先看这里。

**状态栏 / 导航栏**

- `capacitor.config.ts` 里 `plugins.SystemBars.style = 'DARK'`，固定深色系统栏 +
  浅色图标，不跟随手机的浅色模式。
- `android/app/src/main/res/values/styles.xml` 里补了 `statusBarColor`、
  `navigationBarColor`、`windowLightStatusBar/NavigationBar = false` 和
  `windowBackground = #0b0b0c`。Android 15+ 强制 edge-to-edge，颜色项主要对旧系统
  生效；新系统靠透明栏 + 页面底色，所以 `windowBackground` 必须是深色。
- 启动主题改成纯 `#0b0b0c`，不再显示 Capacitor 默认的白底 logo 闪屏。

**安全区（safe-area）**

- Capacitor 8 的 `SystemBars` 默认 `insetsHandling: 'css'`，会给页面注入
  `--safe-area-inset-*`。新版 WebView（Chromium 140+）配合
  `index.html` 的 `viewport-fit=cover` 也会提供真实的 `env(safe-area-inset-*)`；
  旧版 WebView 则由原生端给 WebView 补 padding，并把 inset 归零。
- `src/index.css` 的 `.safe-top` / `.safe-bottom` 改成优先用
  `var(--safe-area-inset-*)`，没有再回退到 `env()`。这样 Android WebView 和
  PWA/iOS 都能用，且键盘弹出时 Capacitor 注入的 bottom 为 0，不会多留一条空白。
- 顶部 `TopBar` 已有 `.safe-top`；底部 `CaptureBar` 原来漏了 `.safe-bottom`，
  已补上。手势导航条不会再压住输入框。

**软键盘**

- Capacitor 8 的 `SystemBars` 自己监听 IME inset：键盘弹出时给原生 View 加底部
  padding，WebView 视口随之缩短，底部输入条会整体抬到键盘上方。
- 因此**没有**在 `AndroidManifest.xml` 加 `windowSoftInputMode="adjustResize"`。
  模板故意不写这个属性；再叠加 `adjustResize` 有在部分机型上重复留白的风险。
  如果以后遇到某个 OEM 键盘仍然遮挡，再给 `MainActivity` 单独加：

  ```xml
  android:windowSoftInputMode="adjustResize"
  ```

- 未安装 JDK/SDK，本次没有跑 Gradle，也没有在真机上做键盘/系统栏的目视验证。
  上面结论基于 Capacitor 8.6 的 `SystemBars.java` 实现和 WebView 安全区行为。

## 12. 提交前检查

```bash
pnpm test        # 34 项纯逻辑测试
pnpm build       # tsc -b + vite build
pnpm android:build
```
