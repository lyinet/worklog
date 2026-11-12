import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // 安卓包名，也是签名和上架的唯一标识。用反向域名，发布后不能再改。
  appId: 'com.lyinet.worklog',
  // 桌面图标、系统设置、任务切换器里显示的名字。
  appName: '工作簿',
  // Vite 的构建产物目录。cap sync 会把它整个拷到
  // android/app/src/main/assets/public，WebView 从这里加载页面。
  webDir: 'dist',
  // WebView 自身和启动闪屏的底色，与 index.css 的 #0b0b0c 一致，
  // 避免页面首帧之前闪一下白底。
  backgroundColor: '#0b0b0c',
  server: {
    // 本地资源用 https://localhost 加载而不是 http://localhost。
    // 这样 WebView 认为页面处于安全上下文，IndexedDB、Clipboard 等 API 不被限制。
    androidScheme: 'https',
  },
  plugins: {
    SystemBars: {
      // 固定为深色系统栏（深色底 + 浅色图标）。应用本身只有深色主题，
      // 不能用默认值跟随系统，否则手机开浅色模式时状态栏图标会变黑看不清。
      style: 'DARK',
      // 安全区交给 Capacitor 处理：新版 WebView 由 Chromium 提供真实的
      // env(safe-area-inset-*)，旧版 WebView 由原生端补 padding 并把 inset 归零。
      // 页面里统一用 env() 即可，两种情况都不会重复留白。
      insetsHandling: 'css',
      // index.html 的 viewport 已写 viewport-fit=cover，
      // 提前告知原生端可减少首帧的布局跳动。
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
