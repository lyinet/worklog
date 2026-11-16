# 发布 release APK

从签名、构建到验证的完整流程。**本文不含密码**：实际密码只写在
`android/keystore.properties`，该文件和 keystore 都已被 `.gitignore` 忽略。

## 1. 机密文件在哪

| 文件 | 作用 | 是否提交 |
| --- | --- | --- |
| `android/app/worklog-release.keystore` | 发布签名密钥（PKCS12） | 否 |
| `android/keystore.properties` | keystore 路径、密码、别名 | 否 |
| `android/keystore.properties.example` | 字段说明模板 | 是 |

确认忽略规则生效：

```bash
git check-ignore -v android/keystore.properties android/app/worklog-release.keystore
```

**密码看 `android/keystore.properties` 的 `storePassword` / `keyPassword`。**
不要把密码贴进 issue、聊天、提交信息或 `docs/` 下的任何文件。

## 2. 签名信息

| 项目 | 值 |
| --- | --- |
| keystore 类型 | PKCS12 |
| alias | `worklog` |
| 算法 | RSA 2048 / SHA384withRSA |
| 有效期 | 10000 天 |
| 证书 DN | `CN=Worklog, OU=Mobile, O=Lyinet, L=Shanghai, ST=Shanghai, C=CN` |
| 证书 SHA-256 | `6B:FA:95:31:76:5D:BB:B7:FE:3E:0E:8A:E0:13:D6:DE:95:C6:E3:23:C0:2A:84:9C:96:5D:D4:2E:F8:3C:22:84` |

证书指纹用于核对上传到应用商店的包是否由同一把密钥签名。

## 3. 首次生成 keystore（已生成，勿重复执行）

只有换包名或密钥彻底丢失后才需要重新生成。重新生成会导致已发布应用无法覆盖升级。

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
cd android/app

PASS=$(openssl rand -base64 24)
keytool -genkeypair -v \
  -keystore worklog-release.keystore \
  -storetype PKCS12 \
  -alias worklog \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Worklog, OU=Mobile, O=Lyinet, L=Shanghai, ST=Shanghai, C=CN" \
  -storepass "$PASS" -keypass "$PASS"
```

然后把密码写进 `android/keystore.properties`：

```properties
storeFile=app/worklog-release.keystore
storePassword=刚才生成的密码
keyAlias=worklog
keyPassword=刚才生成的密码
```

`storeFile` 的相对路径以 `android/` 为基准；绝对路径也可用。

## 一条命令打 release 包

准备好第 1 节的两个本地签名文件后，在仓库根目录执行：

~~~bash
bash scripts/build-release.sh
~~~

脚本默认使用 Homebrew 的 JDK 21 和 Android SDK（与 debug 脚本相同），
也可通过 JAVA_HOME / ANDROID_HOME 指定已有工具链，需要 build-tools 36.0.0。

脚本先检查工具链、android/keystore.properties 的四个必填字段，以及
storeFile 指向的 keystore 是否存在、可读；相对路径以 android/ 为基准。
缺少签名配置会直接报错退出，不会回退到 debug 签名，也不会输出密码。
然后依次执行 pnpm build、npx cap sync android、./gradlew assembleRelease。
Gradle 会校验 versionName 与 package.json 的版本一致。

构建后运行 apksigner verify --verbose --print-certs，签名无效即退出；
输出包含 v1 / v2 签名方案状态和证书指纹，可与第 2 节核对。
minSdk 24 的包使用 v2 签名即可，v1 显示 false 不代表校验失败。
最后用 aapt2 读取 APK 中的 versionName / versionCode，打印绝对路径和字节大小。
产物为 android/app/build/outputs/apk/release/app-release.apk。
脚本不安装 APK；发版前仍需单独运行 pnpm test，并在目标设备上验证。

## 4. 手动构建

```bash
pnpm test
pnpm build
pnpm android:sync
cd android
./gradlew assembleRelease
```

产物：

```text
android/app/build/outputs/apk/release/app-release.apk
```

`release` 已开启 `minifyEnabled` + `shrinkResources`。`app/proguard-rules.pro`
保留了 Capacitor 插件、`@PluginMethod`、`@JavascriptInterface` 等反射入口；
前端文件在 `assets/public`，不属于 Android 资源，不会被 `shrinkResources` 裁掉。

如果 `android/keystore.properties` 或 keystore 缺失，构建不会整体失败：
release 会回退到 debug 签名并打印警告。**这种 APK 只能本地测试，不可分发。**

发版前版本号规则：

- `android/app/build.gradle` 的 `versionCode` 每次 +1。
- `versionName` 必须和根目录 `package.json` 的 `version` 一致，否则构建直接失败。

## 5. 验证

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
APK=android/app/build/outputs/apk/release/app-release.apk

# 签名有效
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$APK"

# 版本与包名
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$APK" | head -3

# 前端资源确实在包里
unzip -l "$APK" | grep 'assets/public/'
```

安装到模拟器或真机：

```bash
adb install -r "$APK"
adb shell am start -W -n com.lyinet.worklog/.MainActivity
```

从 debug 包切到 release 包时，签名不同，`adb install -r` 会报
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`。必须先卸载，**卸载会清空 IndexedDB**，
先在 App 里导出 JSON 备份。

## 6. 备份 keystore（最重要）

keystore 和密码缺一不可。丢了 keystore 就无法再给 `com.lyinet.worklog`
发升级包，只能换包名重新上架，老用户数据也无法延续。

至少保留三份，分开放：

1. 密码管理器：把 keystore 作为附件，备注里放 alias 和密码。
2. 离线加密盘 / 另一台电脑：不要只放在本机。
3. 团队保险柜或受控的加密备份。

本机打包备份：

```bash
tar czf worklog-signing-backup.tgz \
  android/app/worklog-release.keystore android/keystore.properties

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in worklog-signing-backup.tgz \
  -out worklog-signing-backup.tgz.enc

rm worklog-signing-backup.tgz
```

恢复后先验证，不要直接用于构建：

```bash
keytool -list -v -keystore worklog-release.keystore -alias worklog
```

核对证书 SHA-256 与第 2 节一致，再放回 `android/app/`。

## 7. 本次构建记录

环境：JDK 21.0.13、Android SDK 36、build-tools 36.0.0、Gradle 8.14.3、
AGP 8.13.0、Capacitor 8.6，macOS arm64。

| 项目 | 结果 |
| --- | --- |
| `pnpm test` | 104 项通过 |
| `pnpm build` | 通过 |
| `./gradlew assembleRelease` | 45 秒（增量，121 tasks） |
| release APK | **1,128,194 字节（约 1.1 MB）** |
| APK SHA-256 | `913f171ddd89e46998dae8fd71c136f021ca3f07c5af9a126f193e93ae7261ca` |
| `apksigner verify` | 通过（v2 scheme） |
| `aapt2 dump badging` | `com.lyinet.worklog`，versionCode 1，versionName 1.0.0 |
| 模拟器安装 | `emulator-5554` 安装并启动通过 |
| 冒烟验证 | 首屏正常、写入一条记录、强杀重启后数据仍在 |

minify 后的包比 debug 包（约 4.1 MB）小很多，且前端资源完整：14 个
`assets/public/` 文件，`index.html`、JS、CSS、manifest、Service Worker 都在。
