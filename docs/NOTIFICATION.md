# 通知栏快捷记录

在「更多」菜单打开「通知栏快捷记录」，通知栏显示「工作簿 · 点一下记一笔」。
通知本体和「记一笔」按钮都直接打开输入框，不增加确认步骤。
默认关闭，可随时在同一菜单关闭；关闭会立即撤掉通知。

## 入口与安静通知

- 两个点击目标使用同一个不可变 PendingIntent，沿用桌面小部件的
  `focusCapture=true` 与 `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK`。
- `MainActivity` 原有 `/?focus=capture`、WebView 抢焦点、软键盘唤起和
  前端输入框重试聚焦逻辑未另造一套。沿用 Activity 重建策略，确保已打开 App
  或菜单时仍直达输入态；与小部件一样，重建不会保留尚未保存的输入草稿。
- Android 8+ 使用 `quick_capture` 低重要性频道，无声音、无震动、无角标；
  较旧系统使用低优先级、静默通知。通知设置 ongoing，不随点击自动撤销。
- 不加前台服务、不轮询、不定时提醒。Android 14+ 允许用户划掉部分 ongoing
  通知；这里尊重系统行为，不强行马上补回，下次启动或返回 App 时重新同步。

## 权限与持久化

- Android 13+ 仅首次主动开启开关时申请 `POST_NOTIFICATIONS`。
  权限弹窗已请求标记与开关意愿都持久化；拒绝或划掉后不再反复弹。
- 权限拒绝、应用通知被关闭或该频道被关闭时，开关保留开启意愿，显示
  「通知未获允许，请到系统设置开启」和「去系统设置」按钮。
  从系统设置返回自动读取权限，有权限才发通知；关闭开关可取消开启意愿。
- 仓库没有通用偏好存储。本功能选择一个应用内的薄 Capacitor 插件，使用
  Android `SharedPreferences` 保存两个布尔值，而不是 localStorage：
  开机广播时 WebView 尚未加载，原生必须能直接读到开关。偏好不触碰记录库。
- 插件注册于 `MainActivity`，在加载、返回前台时按偏好恢复通知。
  `CaptureNotificationReceiver` 接收 `BOOT_COMPLETED` 和
  `MY_PACKAGE_REPLACED`，开机解锁后或应用更新后按同一偏好恢复。
  开机恢复不是瞬时：本次模拟器实测有约 30～40 秒广播投递延迟，
  开机后约半分钟左右回来；第 12 秒尚无通知，第 45 秒已恢复。
  接收器不申请权限；系统强行停止应用后，系统可能不再送广播，需再次打开 App。
- 网页/PWA 显示「仅安卓版可用」并禁用开关，不伪造浏览器常驻通知。

## 本版不做 RemoteInput

不做「在通知内直接打字回复并写库」。记录存在 WebView 的 IndexedDB 中，
原生 RemoteInput 接收器不能安全直接使用同一写入接口；另做原生写库或双向同步
会引入跨存储一致性、并发和恢复风险。点击直达现有输入框复用唯一写入路径，
已满足快速记录目标。

## 验证记录

2026-11-16，在本功能 worktree 完成。自动测试和前端构建由实现方运行；
APK 构建、浏览器截图与模拟器操作由集成方运行，实现方逐张查看下表的仓内截图。
截图均从实测原图直接复制，未重新生成或修改。

### 构建与浏览器

| 命令 | 实际结果 | 日志 / 产物 |
| --- | --- | --- |
| `pnpm test` | 12 个测试文件、140 个测试通过；包含通知桥接参数与开关/拒权/失败文案测试 | `/tmp/worklog-notification-test.log` |
| `pnpm build` | 通过，含 `tsc -b` 和 Vite/PWA 构建 | `/tmp/worklog-notification-build.log` |
| `npx cap sync android` | 通过 | `/tmp/worklog-notification-sync.log` |
| `cd android && ./gradlew assembleDebug` | `BUILD SUCCESSFUL in 6s`，153 个任务执行 | `/tmp/lead-notif-assemble.log` |
| `pnpm dev` | 启动成功，`127.0.0.1:5199` 返回 HTTP 200 | 浏览器以 `?demo=1` 检查 |

安卓构建环境：`JAVA_HOME=/opt/homebrew/opt/openjdk@21`、
`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`。
APK 为 `android/app/build/outputs/apk/debug/app-debug.apk`，4,334,617 字节。

浏览器使用基于 `scripts/shot.mjs` 的临时驱动
`/tmp/worklog-notification-shot.mjs`，注入通知原生桥 fixture 后实际点击开关，
检查关闭、开启、拒权状态；这不是设备系统权限验证。
原截图为 `/tmp/lead-notif-off.png`、`/tmp/lead-notif-granted.png`、
`/tmp/lead-notif-denied.png`、`/tmp/lead-notif-denied-320.png`。
390 px 与 320 px 宽度下拒权提示和「去系统设置」可见，320 px 无横向溢出。

### Android 16 模拟器

设备：`emulator-5554`，Android 16 / SDK 36。旧 1.1.0 包因签名不同无法覆盖安装，
集成方卸载旧包后安装 debug APK；本次不是保留旧数据的升级验证。

| 操作 | 实际结果 | 仓内截图 |
| --- | --- | --- |
| 打开更多菜单 | 显示「通知栏快捷记录 / 已关闭」 | [notification-01-menu.png](screenshots/notification-01-menu.png) |
| 首次打开开关 | 系统弹出「Allow 工作簿 to send you notifications?」 | [notification-02-permission.png](screenshots/notification-02-permission.png) |
| 点击 Allow，拉下通知栏 | 工作簿通知归在 Silent 分组，正文「点一下记一笔」，含「记一笔」动作 | [notification-03-shade.png](screenshots/notification-03-shade.png) |
| 点击通知本体 | MainActivity 到前台，输入框软键盘弹起 | [notification-04-after-tap.png](screenshots/notification-04-after-tap.png) |
| 关闭开关 | 菜单显示「已关闭」，`dumpsys notification` 中该应用 NotificationRecord 归零 | [notification-05-off.png](screenshots/notification-05-off.png) |
| 开关开启后重启设备 | 未打开 UI，开机后通知自动恢复；非瞬时，详见下文 | [notification-06-boot-restore.png](screenshots/notification-06-boot-restore.png) |
| 点击通知「记一笔」动作 | 同样进入 MainActivity，输入框软键盘弹起 | [notification-07-action.png](screenshots/notification-07-action.png) |
| 浏览器 fixture 拒权（390 px） | 保留「已开启」意愿，显示「通知未获允许，请到系统设置开启」及设置按钮 | [notification-08-browser-denied.png](screenshots/notification-08-browser-denied.png) |
| 浏览器 fixture 拒权（320 px） | 相同文案与按钮可见，无横向溢出 | [notification-09-browser-denied-320.png](screenshots/notification-09-browser-denied-320.png) |

集成方的 `dumpsys notification` 确认 `channel=quick_capture`、
`flags=ONGOING_EVENT|ONLY_ALERT_ONCE|SILENT`、`title=工作簿`、
`text=点一下记一笔`、`actions=1`。两种通知点击后的 logcat 均出现
`GoogleInputMethodService onStartInputView(WebEditText)`，与截图的软键盘一致。

开机恢复实测：boot+12s 查询仍为 0 条，boot+45s 已有通知；logcat 在 10:33:33
记录为 `CaptureNotificationReceiver` 广播启动应用进程，未进入 UI，恢复后的
频道、flags、标题及正文与重启前一致。结论是开机后约半分钟左右回来，
本次观察到约 30～40 秒的 `BOOT_COMPLETED` 投递延迟，不保证开机瞬间出现。

## 尚未验证

- 真机，以及 Android 14、15 和更低版本与本次 Android 16 模拟器的差异。
- 用户手动划掉常驻通知后的行为。
- 设备上拒绝通知权限后，再到系统设置开启的完整路径；拒权文案目前只由浏览器
  fixture 验证。频道权限关闭、拒绝或划掉权限弹窗后不重复弹，也尚未做设备验证。
- 保留旧包数据的升级、`MY_PACKAGE_REPLACED` 恢复、系统强行停止后的恢复，
  以及独立的应用进程重启场景；本次已验证的是设备重启后广播恢复。

## release 包实测（v1.2.0）

debug 包通过不代表发布包通过：release 开了 minify，插件的反射注册可能被裁掉。
`bash scripts/build-release.sh` 打出的签名包（versionName 1.2.0 / versionCode 3，
1.1M，v2 签名校验通过）装到同一台 Android 16 模拟器上实测：

- 菜单里新项正常显示，首次打开开关仍弹出系统通知权限框；
- 允许后 `dumpsys notification` 里 `channel=quick_capture`、
  `flags=ONGOING_EVENT|ONLY_ALERT_ONCE|SILENT`、`title=工作簿`、`actions=1`；
- 点通知本体回到前台，logcat 出现 `GoogleInputMethodService onStartInputView`，
  即输入框软键盘弹起。

结论：release 构建下插件与通知链路都在。
