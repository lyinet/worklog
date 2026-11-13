# 语音输入

说完一句话，文字落到输入框末尾，人还能改，回车才保存。语音不自动记一笔。

## 实现

入口只有一个：`src/plugins/voice.ts` 的 `createVoiceEngine()`，UI 不直接依赖具体实现。

- **安卓壳**：`@capacitor-community/speech-recognition@7.0.1`。实测可装在
  `@capacitor/core@8.6.0` 上，`cap sync` + `assembleDebug` 编译通过。用
  `android.speech.SpeechRecognizer`，`popup:false` 不弹系统「请说话」框，
  录音态由我们自己的按钮画。
- **浏览器 / PWA**：`window.SpeechRecognition || webkitSpeechRecognition`。
  没有这个 API 时按钮禁用，并显示一行提示。
- **纯逻辑**：`domain/voiceText.ts`（追加拼接）、`domain/voiceErrors.ts`
  （把原生 / 浏览器的错误归一成中文文案），都有测试。

## 交互

| 状态 | 表现 |
| --- | --- |
| 空闲 | 麦克风图标，和「记下」并排，48px 方形按钮 |
| 录音中 | 红色脉冲边框 + 四根跳动波形条，输入条上方「在听…」 |
| 有结果 | 追加到草稿末尾，必要时补空格；光标移到末尾 |
| 失败 | 一行可读错误；没权限时引导去系统设置 |
| 不支持 | 按钮禁用 + 常驻提示 |

识别结果只追加，不覆盖已经打的字，也不自动提交。草稿为空时直接用识别结果。

## 插件的两个坑

1. `stop()` 的 Promise 在原生端不会 resolve（只触发收尾，结果仍走 `start()` 的
   Promise）。所以适配层不 await 它，另挂 4 秒兜底。
2. `load()` 无条件创建 `SpeechRecognizer`。模拟器没有识别服务时并不崩，
   但 `start()` 会回 `Network error` / `Client side error`，已归类成可读文案。

## 权限

`AndroidManifest.xml` 只加了两处：`RECORD_AUDIO` 权限，以及 Android 11+ 的
`queries`（不声明就查不到系统语音识别服务）。第一次点麦克风时插件申请权限；
拒绝后提示去「系统设置 → 应用 → 工作簿 → 权限」打开。

## 验证记录（2026-11-13）

- `pnpm build`、`pnpm test`（126 个测试）、`npx cap sync android`、
  `./gradlew assembleDebug` 全过。
- `adb install -r` 到 emulator-5554：
  - 首次点麦克风弹出「Allow 工作簿 to record audio?」系统权限框；
  - 点 Don't allow，界面显示去系统设置的引导文案，不崩；
  - 授予权限后再点，显示「在听…」+ 录音态；模拟器无识别服务，随后显示
    「网络不给力，语音识别要联网」，按钮恢复可点。
- 浏览器端用 CDP 注入假的 SpeechRecognition 验证了：追加到已有草稿、
  权限拒绝、没听到声音、网络错误四种状态。

截图见 [docs/screenshots/](screenshots/)（`voice-01` ~ `voice-08`）。
