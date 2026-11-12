// 从 public/icons/icon-512.png 生成 Android 各密度的启动图标与启动图。
// 用法：node scripts/gen-android-icons.mjs
//
// 图标：
//   - legacy ic_launcher.png / ic_launcher_round.png（48/72/96/144/192）
//   - adaptive icon 前景层 ic_launcher_foreground.png（108dp 视口，图形收在中间 72dp 内）
//   - 背景层用 values/ic_launcher_background.xml 的 #0b0b0c
// 启动图：
//   - drawable*/splash.png，纯 #0b0b0c 底 + 居中图标（与 PWA 图标一致）
//
// 方形图用 macOS 自带的 sips 缩放；圆形图和带透明通道的前景层用无头 Chrome 渲染，
// 这样前景层能保留透明像素，圆形图也能裁出真正的圆角。
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_ICON = path.join(ROOT, 'public', 'icons', 'icon-512.png')
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
const PORT = 9352

const BG = '#0b0b0c'
const MINT = '#7ee2a8'

// 100x100 坐标系里的本子图形，与 public/favicon.svg、PWA 图标同一套造型。
const GLYPH = `
  <rect x="28" y="21" width="46" height="60" rx="7" fill="${MINT}" fill-opacity="0.10" stroke="${MINT}" stroke-width="4.5"/>
  <rect x="22.5" y="21" width="8" height="60" rx="4" fill="${MINT}"/>
  <circle cx="26.5" cy="34" r="2.2" fill="${BG}"/>
  <circle cx="26.5" cy="51" r="2.2" fill="${BG}"/>
  <circle cx="26.5" cy="68" r="2.2" fill="${BG}"/>
  <path d="M39 40 H64 M39 52 H64" stroke="${MINT}" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M39 65 l5 5 l11 -12" fill="none" stroke="${MINT}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
`

// 图形含描边后的中心是 (48.25, 51)；0.8 的缩放让对角线约 68dp，
// 落在 adaptive icon 中间 72dp 安全区里，圆形/圆角遮罩都不会切到本子。
const FOREGROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(54 54) scale(0.8) translate(-48.25 -51)">${GLYPH}</g>
</svg>`

const DENSITIES = [
  { dir: 'mdpi', scale: 1 },
  { dir: 'hdpi', scale: 1.5 },
  { dir: 'xhdpi', scale: 2 },
  { dir: 'xxhdpi', scale: 3 },
  { dir: 'xxxhdpi', scale: 4 },
]

// 与 Capacitor 模板一致的启动图尺寸，只换内容不换尺寸。
const SPLASHES = [
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable', 480, 320],
]

const px = (dp, scale) => Math.round(dp * scale)
const iconUrl = `file://${SRC_ICON}`

function roundIconHtml(size) {
  // 放大 14%：PWA 图标的圆角面板四角被裁到圆外，只留下深色底和本子，
  // 不会在圆形图标边缘露出面板的圆弧接缝。
  const scale = 1.14
  const offset = (100 - 100 * scale) / 2
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs><clipPath id="circle"><circle cx="50" cy="50" r="50"/></clipPath></defs>
  <image href="${iconUrl}" x="${offset}" y="${offset}" width="${100 * scale}" height="${100 * scale}" clip-path="url(#circle)"/>
</svg></body></html>`
}

function foregroundHtml(size) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${FOREGROUND_SVG}</body></html>`
}

function splashHtml(w, h) {
  const icon = Math.round(Math.min(w, h) * 0.28)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:${BG}}
  body{display:flex;align-items:center;justify-content:center}
  img{display:block;width:${icon}px;height:${icon}px}
</style></head><body><img src="${iconUrl}" width="${icon}" height="${icon}" alt=""></body></html>`
}

fs.mkdirSync(RES, { recursive: true })

// 1. legacy 方形图标：直接高质量缩放 512 源图，保留 PWA 图标的深底 + 圆角面板。
for (const { dir, scale } of DENSITIES) {
  const size = px(48, scale)
  const outDir = path.join(RES, `mipmap-${dir}`)
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'ic_launcher.png')
  execFileSync('sips', ['-z', String(size), String(size), SRC_ICON, '--out', out], {
    stdio: 'ignore',
  })
  const actual = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out])
    .toString()
    .trim()
  if (!actual.includes(`pixelWidth: ${size}`) || !actual.includes(`pixelHeight: ${size}`)) {
    throw new Error(`${out} 尺寸不对：${actual}`)
  }
  console.log(`mipmap-${dir}/ic_launcher.png: ${size}x${size}`)
}

// 2. 无头 Chrome：圆形图标、adaptive 前景层、启动图。
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-android-icons-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(tmpDir, 'profile')}`,
    '--window-size=512,512',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome devtools not reachable')
}

let ws
let msgId = 0
let pageSeq = 0
const pending = new Map()

function send(method, params = {}) {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

function pngSize(buf) {
  if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error('not a PNG')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

async function render({ file, w, h, html, transparent = false }) {
  const page = path.join(tmpDir, `page-${++pageSeq}.html`)
  fs.writeFileSync(page, html, 'utf8')

  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setDefaultBackgroundColorOverride', {
    color: transparent
      ? { r: 0, g: 0, b: 0, a: 0 }
      : { r: 11, g: 11, b: 12, a: 1 },
  })
  await send('Page.navigate', { url: `file://${page}` })

  // 等图片解码完成；SVG 页面没有 img，readyState=complete 即可。
  for (let i = 0; i < 50; i++) {
    const r = await send('Runtime.evaluate', {
      expression:
        "document.readyState === 'complete' && [...document.images].every(img => img.complete && img.naturalWidth > 0)",
      returnByValue: true,
    })
    if (r.result.value === true) break
    await sleep(100)
  }
  await sleep(120)

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
  })
  const buf = Buffer.from(shot.data, 'base64')
  const got = pngSize(buf)
  if (got.w !== w || got.h !== h) {
    throw new Error(`${file}: got ${got.w}x${got.h}, expected ${w}x${h}`)
  }
  fs.writeFileSync(file, buf)
  console.log(`${path.relative(ROOT, file)}: ${got.w}x${got.h}, ${buf.length} bytes`)
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

  for (const { dir, scale } of DENSITIES) {
    const outDir = path.join(RES, `mipmap-${dir}`)
    const size = px(48, scale)
    await render({
      file: path.join(outDir, 'ic_launcher_round.png'),
      w: size,
      h: size,
      html: roundIconHtml(size),
      transparent: true,
    })

    const fg = px(108, scale)
    await render({
      file: path.join(outDir, 'ic_launcher_foreground.png'),
      w: fg,
      h: fg,
      html: foregroundHtml(fg),
      transparent: true,
    })
  }

  for (const [dir, w, h] of SPLASHES) {
    const outDir = path.join(RES, dir)
    fs.mkdirSync(outDir, { recursive: true })
    await render({
      file: path.join(outDir, 'splash.png'),
      w,
      h,
      html: splashHtml(w, h),
    })
  }
} finally {
  ws?.close()
  chrome.kill()
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      break
    } catch {
      await sleep(100)
    }
  }
}
