/// <reference types="vite-plugin-pwa/client" />

import { registerSW } from 'virtual:pwa-register'

/**
 * 注册 Service Worker。`index.html` 直接以 module 引入本文件，
 * 不改动 `src/main.tsx` 和任何业务组件。
 * autoUpdate 版本会自动切到新 SW 并刷新页面；注册失败不阻塞应用本身。
 */
registerSW({ immediate: true })
