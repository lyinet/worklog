// Minimal CDP driver: screenshot + console capture without extra deps.
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const url = process.argv[2]
const out = process.argv[3] ?? '/tmp/shot.png'
const width = Number(process.argv[4] ?? 390)
const height = Number(process.argv[5] ?? 844)

const port = 9333
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=/tmp/chrome-shot-profile',
    '--window-size=' + width + ',' + height,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome devtools not reachable')
}

const ws = new WebSocket(await getWsUrl())
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
const logs = []

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(
      `[console.${msg.params.type}] ` +
        msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '),
    )
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('[log] ' + msg.params.entry.text)
  }
}

function send(method, params = {}) {
  const msgId = ++id
  ws.send(JSON.stringify({ id: msgId, method, params }))
  return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }))
}

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: true,
})
await send('Page.navigate', { url })
await sleep(2500)

const html = await send('Runtime.evaluate', {
  expression: 'document.getElementById("root").childElementCount',
  returnByValue: true,
})
console.log('root children:', html.result.value)
if (logs.length) console.log(logs.join('\n'))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('saved', out)
ws.close()
chrome.kill()
process.exit(0)
