/// <reference types="vite-plugin-pwa/client" />

import { registerSW } from 'virtual:pwa-register'

/**
 * 只有在浏览器里才注册 Service Worker。
 *
 * Capacitor 壳里资源是从 APK 本地加载的，SW 不但没用，还有害：SW 缓存会盖住
 * 随 APK 更新的资源，用户升级后仍看到旧版本，甚至首屏白屏重载。原生端由
 * Capacitor 自己负责资源更新，这里直接跳过。
 */
function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
}

if (!isNativeShell()) {
  registerSW({ immediate: true })
}
