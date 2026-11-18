# 通知直接回复（v1.3.0）

通知上的「记一笔」打开 Android 系统的回复框。发送后不启动 Activity，
不打开 WebView：原生先保存，工作簿下次启动或回到前台再补入记录。
通知本体仍然打开原有输入框。沿用 `quick_capture` 静默频道。

## 两段存储

记录的唯一正式存储仍是 WebView 的 IndexedDB。BroadcastReceiver 不能直接使用
WebView 的 IndexedDB，故使用同一 `capture_notification` SharedPreferences
保存 JSON 队列，每条包含：

- `id`：`notification-` 加 UUID，标识一次发送；相同正文的两次发送不合并。
- `text`：系统回复原文。
- `createdAt`：Receiver 收到回复时的 epoch 毫秒，不使用之后打开 App 的时间。

Receiver 用 `goAsync()` 和单线程执行器处理磁盘写入；同步 `commit()` 成功后
才更新通知为「已记下 N 条，打开工作簿即入库」。失败显示
「未能保存，请打开工作簿重记」，并写 logcat，不伪报成功。

待领取队列最多 200 条，溢出丢最旧，待上报计数持久化并写 logcat，通知与 App
轻提示均展示丢弃数量；领取 pending 时原子消费待上报计数，不重复提醒旧溢出。
正在入库的恢复副本最多另占 200 条，不因新回复覆盖。
因此极端情况下两个数组合计最多 400 条；这不是无限增长的第二数据库。

## 领取、确认与崩溃恢复

仅「取走即永久删除」无法保证可靠性：拿到数据后、IndexedDB 落盘前进程被杀，
数据就丢失。因此接口分为三步：

1. `drainPending({ owner })`：在同一原生锁内，把 pending 原子移入持久化
   in-flight 恢复数组，同时清空 pending。当前领取期间重复或并发 drain 返回空，
   不会分发同一批。每个 WebView 会话有独立 owner。
2. Web 调用现有 `useEntries.add(text, { id, createdAt })`，沿用串行 writer、
   `createEntry` 的 trim 与标签解析规则。原生不另实现标签语义。
   按稳定 id 查已有记录，重放不新增第二条，也不覆盖编辑和待删除标记。
3. 每条 `store.put` 成功后，`acknowledgePending({ owner, ids })` 删除对应恢复副本；
   空白正文仅确认、不生成记录。整批结束或失败时 `releasePending({ owner })`
   释放领取锁。失败不确认未保存记录，下次打开重试。

进程重启后内存领取锁自然消失，先恢复未确认的 in-flight，再领取新增 pending。
Activity 销毁时释放自己持有的锁；其他 WebView 会话在旧会话仍持有锁时不能领取。
落库已完成、确认失败的条目用相同 id 恢复，不重复生成记录。

## 生命周期和关闭

- App 加载完成后、原生 `statusChanged`（返回前台）和页面重新可见时触发补入。
- Receiver 用限本包广播告知原生插件 `pendingChanged`，App 已在前台时也能补入。
  动态 Receiver 使用 `RECEIVER_NOT_EXPORTED`；回复 PendingIntent 显式指向现有
  非导出的 Receiver。Android 12+ 仅回复 PendingIntent 使用 `FLAG_MUTABLE`。
- Web 将导入串行化，兼容 StrictMode 的 effect 重挂载，不因多个生命周期事件重复提交。
- 显示「补入 N 条通知记录」，8 秒后收起；部分失败提示原记录已保留，不弹窗。
- IndexedDB 不可用而回退 MemoryStore 时不领取、不确认原生队列，避免误报已持久化。
- 关闭开关时，同一次原生同步操作清除 pending、in-flight、溢出计数和领取锁，
  随即取消通知。延迟到达的回复检查开关，不会重新建队列。
  Web 收到关闭事件后停止处理尚未入库的条目；已经提交的正式记录不删除。

## 本工作树验证（2026-11-18）

- `pnpm test`：13 个文件、166 个测试通过（最终记录见交付报告）；新增测试覆盖
  标签清洗、原生时间、相同正文不同发送、重复/并发领取、逐条确认、写入失败、
  确认失败重放、损坏输入、空白回复、溢出计数与处理中关闭。
- `pnpm build`：通过，含 TypeScript 与 Vite/PWA。
- `npx cap sync android`：通过。
- `./gradlew assembleDebug`：沙箱阻止写入 Gradle wrapper 锁文件，未完成 Java 编译：
  `java.io.FileNotFoundException: /Users/lyinet/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3-all.zip.lck (Operation not permitted)`。
- `codex review`：命令启动失败，`failed to initialize in-process app-server client:
  Operation not permitted (os error 1)`；已人工复核队列/确认/生命周期路径。
- UI 截图未完成：`pnpm dev --host 127.0.0.1 --port 5209` 启动被沙箱拒绝，
  `Error: listen EPERM: operation not permitted 127.0.0.1:5209`。

日志位于 `/tmp/worklog-notification-reply-{test,build,sync,gradle,review,dev}.log`。

## 待集成方验证

不能把前端测试等同于系统 RemoteInput 实测。需在允许构建和启动设备的环境执行：

1. 编译 debug / release，检查 minify 后三个插件方法与事件仍可用。
2. Android 7、12、13+：在通知回复框输入中文与 #标签，发送不打开 Activity，
   系统回复框完成处理、通知计数增长；连续两条相同正文仍保留两次发送。
3. 冷启动、热启动、App 已在前台、跨本地零点：逐条落库，时间归原生接收日，
   显示轻提示且不重复补入。
4. 领取后中断进程、落库后确认前中断、磁盘/桥接失败：重启后恢复未确认记录，
   不创建相同 id 的第二条；验证通知最终恢复默认正文。
5. 关闭开关后队列与通知均清空，重开不补入旧内容；测试队列满的计数/丢弃提示。
6. 320 px 和 390 px 下轻提示换行，不挤压输入框、不发生横向滚动。

## 集成方实测（2026-11-18，emulator-5554 / Android 16 / SDK 36）

跑在本机：`./gradlew assembleDebug` BUILD SUCCESSFUL（沙箱里 worker 写不了 ~/.gradle，构建由集成方执行）。

- 通知里出现内联回复框（占位「刚做了什么?」），点击不打开 Activity，`dumpsys input_method` 显示 `mInputShown=true`。截图 `reply-01-shade.png`、`reply-02-input.png`。
- 输入 `fix the #api token refresh` 发送：logcat 里 `pendingChanged` → `drainPending` → `acknowledgePending`（id `notification-6093ce18-…`）→ `releasePending`，记录以 `#api` 高亮出现在时间线，时间取 16:08。
- 第二条 `queued #bug while closed`（App 进程存活但不在前台）：同样落库，16:11。
- **冷启动真路径**：`adb root` 后 `kill -9` 杀掉进程，再从通知回复 `queued #start while dead`：
  - `shared_prefs/capture_notification.xml` 里 `pending_entries` 出现一条 JSON（含 `notification-0ff1018a-…`、原文、接收时刻 1794989645240），`in_flight_entries` 为空，进程被广播重新拉起；
  - 打开 App 后 pending 与 in-flight 均清空，界面顶部出现「补入 1 条通知记录」，条目落库。
  截图 `reply-03-drained.png`。
- `am force-stop` 后回复不会送达（Android 对 stopped 应用不投递广播），这是系统行为，不是缺陷；文档如实记录。

**仍未验证**：Android 7 / 12 与 13 以下旧版本、release（minify）构建下的回复链路、领取后进程中断的恢复、关闭开关时清除待入库队列、320 px 下轻提示换行。前两项由集成方在合并后补测 release 包。

## release 包实测（v1.3.0，minify 生效）

`bash scripts/build-release.sh` 出的签名包（versionName 1.3.0 / versionCode 4，v2 签名校验通过）装到同一台 Android 16 模拟器：

- 装好后第一次开开关仍弹系统通知权限框，允许后通知正文是「直接回复记一笔，点此打开工作簿」。
- 用 `kill -9` 杀掉进程（release 包不可 `run-as`，读不到 prefs，只能端到端看结果），从通知回复 `release #check` 发送；
- 重新打开 App：顶部出现「补入 1 条通知记录」，时间线里是 `release #check`（`#check` 高亮），时间 16:51。

结论：minify 后接收器、插件桥、补库链路都在，不是只有 debug 包能用。
