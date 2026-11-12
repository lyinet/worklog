// 一次性图标生成：用无头 Chrome 渲染内联 SVG 的 HTML，再用 CDP 截图导出 PNG。
// 用法：node scripts/gen-icons.mjs
// CDP 用法参考 scripts/shot.mjs。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICON_DIR = path.join(ROOT, 'public', 'icons')
const PORT = 9351

const BG = '#0b0b0c'
const MINT = '#7ee2a8'

/** 本子 + 两行字 + 一个勾，深色底薄荷绿。s 是内容缩放，maskable 版留安全边距。 */
function svg({ scale = 1, panel = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" fill="${BG}"/>
  ${panel ? `<rect x="3" y="3" width="94" height="94" rx="22" fill="#141417" stroke="${MINT}" stroke-opacity="0.14" stroke-width="1"/>` : ''}
  <circle cx="50" cy="50" r="38" fill="${MINT}" fill-opacity="0.06"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <rect x="28" y="21" width="46" height="60" rx="7" fill="${MINT}" fill-opacity="0.10" stroke="${MINT}" stroke-width="4.5"/>
    <rect x="22.5" y="21" width="8" height="60" rx="4" fill="${MINT}"/>
    <circle cx="26.5" cy="34" r="2.2" fill="${BG}"/>
    <circle cx="26.5" cy="51" r="2.2" fill="${BG}"/>
    <circle cx="26.5" cy="68" r="2.2" fill="${BG}"/>
    <path d="M39 40 H64 M39 52 H64" stroke="${MINT}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M39 65 l5 5 l11 -12" fill="none" stroke="${MINT}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`
}

function html(size, svgMarkup) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:${BG}}
  svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svgMarkup}</body></html>`
}

// 输出：文件名 / 像素尺寸 / 内容缩放 / 是否画圆角底板
const TARGETS = [
  { file: 'icon-192.png', size: 192, scale: 1.05, panel: true },
  { file: 'icon-512.png', size: 512, scale: 1.05, panel: true },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8, panel: false },
  { file: 'apple-touch-icon.png', size: 180, scale: 1.05, panel: true },
]

fs.mkdirSync(ICON_DIR, { recursive: true })
// favicon 用同一套图形，矢量版给浏览器标签页
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), svg({ scale: 1.05 }), 'utf8')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-icons-'))
const profile = path.join(tmpDir, 'chrome-profile')
const port = PORT

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=512,512`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome devtools not reachable')
}

let ws
let id = 0
const pending = new Map()

function send(method, params = {}) {
  const msgId = ++id
  ws.send(JSON.stringify({ id: msgId, method, params }))
  return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }))
}

function pngSize(buf) {
  if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error('not a PNG')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

try {
  ws = new WebSocket(await getWsUrl())
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (!msg.id || !pending.has(msg.id)) return
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }

  await send('Page.enable')
  await send('Runtime.enable')

  for (const t of TARGETS) {
    const page = path.join(tmpDir, `${t.file}.html`)
    fs.writeFileSync(page, html(t.size, svg({ scale: t.scale, panel: t.panel })), 'utf8')

    await send('Emulation.setDeviceMetricsOverride', {
      width: t.size,
      height: t.size,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Page.navigate', { url: `file://${page}` })

    // 等页面真正画完（内联 SVG，一次 layout 就够）
    for (let i = 0; i < 40; i++) {
      const r = await send('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && !!document.querySelector('svg')",
        returnByValue: true,
      })
      if (r.result.value === true) break
      await sleep(100)
    }
    await sleep(150)

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: t.size, height: t.size, scale: 1 },
    })
    const buf = Buffer.from(shot.data, 'base64')
    const { w, h } = pngSize(buf)
    if (w !== t.size || h !== t.size) {
      throw new Error(`${t.file}: got ${w}x${h}, expected ${t.size}x${t.size}`)
    }
    fs.writeFileSync(path.join(ICON_DIR, t.file), buf)
    console.log(`${t.file}: ${w}x${h}, ${buf.length} bytes`)
  }
  console.log('favicon.svg written')
} finally {
  ws?.close()
  chrome.kill()
  // Chrome 退出后还会往 profile 写几帧，重试删临时目录
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      break
    } catch {
      await sleep(100)
    }
  }
}
