/**
 * 语音输入的唯一入口。UI 只认 VoiceEngine，不认下面的具体实现。
 *
 * 实现分两种：
 * - 安卓壳：@capacitor-community/speech-recognition（Capacitor 8 下编译通过），
 *   用 android.speech.SpeechRecognizer，无系统弹窗，录音态交给我们的按钮。
 * - 浏览器 / PWA：window.SpeechRecognition || webkitSpeechRecognition。
 *
 * 两条路都只负责「把字交出去」，不负责保存，也不直接碰输入框。
 */
import { Capacitor } from '@capacitor/core'
import {
  asVoiceFailure,
  classifyWebError,
  type VoiceFailure,
  type VoicePlatform,
} from '../domain/voiceErrors'

export type { VoiceFailure, VoicePlatform } from '../domain/voiceErrors'

export interface VoiceAvailability {
  available: boolean
  /** 不可用时给按钮下方的一行提示。 */
  hint?: string
}

export interface VoiceEvents {
  /** 已经开始听，UI 显示「在听…」和录音态按钮。 */
  onListening: () => void
  /** 识别到一句（已归一成纯文本），UI 负责追加到草稿末尾。 */
  onResult: (text: string) => void
  onError: (failure: VoiceFailure) => void
  /** 本次录音彻底结束，UI 恢复按钮。 */
  onEnd: () => void
}

export interface VoiceEngine {
  readonly platform: VoicePlatform
  availability(): Promise<VoiceAvailability>
  isListening(): Promise<boolean>
  start(events: VoiceEvents): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
}

/** 点击停止后，原生端迟迟不给结果时的兜底时间。 */
const STOP_FALLBACK_MS = 4000
/** 一次录音最长多久，防止「在听…」永远挂着。 */
const MAX_LISTEN_MS = 60000

// ---------------------------------------------------------------- 安卓原生

type NativeModule = typeof import('@capacitor-community/speech-recognition')

let nativeModule: Promise<NativeModule> | null = null
/** 按需加载：浏览器 / PWA 打包时不把原生插件代码带进去。 */
function loadNative(): Promise<NativeModule> {
  nativeModule ??= import('@capacitor-community/speech-recognition')
  return nativeModule
}

interface AndroidSession {
  settled: boolean
  timers: number[]
  events: VoiceEvents
}

class AndroidVoiceEngine implements VoiceEngine {
  readonly platform: VoicePlatform = 'android'
  private session: AndroidSession | null = null

  /**
   * 原生端按钮始终可点：第一次点会先弹录音权限。设备没有识别服务时
   * 也要能点，点了给一句可读的错误（模拟器就是这种环境）。
   */
  async availability(): Promise<VoiceAvailability> {
    return { available: true }
  }

  async isListening(): Promise<boolean> {
    if (this.session && !this.session.settled) return true
    try {
      const { SpeechRecognition } = await loadNative()
      const { listening } = await SpeechRecognition.isListening()
      return listening
    } catch {
      return false
    }
  }

  async start(events: VoiceEvents): Promise<void> {
    if (this.session && !this.session.settled) return
    this.clearTimers()
    const session: AndroidSession = { settled: false, timers: [], events }
    this.session = session

    let plugin: NativeModule['SpeechRecognition']
    try {
      plugin = (await loadNative()).SpeechRecognition

      // 第一次点麦克风在这里要权限；已经授予时是一次无副作用的检查。
      const current = await plugin.checkPermissions()
      if (current.speechRecognition !== 'granted') {
        const requested = await plugin.requestPermissions()
        if (requested.speechRecognition !== 'granted') {
          this.finish(session, () => events.onError({ code: 'permission' }))
          return
        }
      }

      // 权限之后再看服务：模拟器没有 RecognitionService，给「设备不支持」而不是崩。
      const { available } = await plugin.available()
      if (!available) {
        this.finish(session, () => events.onError({ code: 'unsupported' }))
        return
      }
    } catch (err) {
      this.finish(session, () => events.onError(asVoiceFailure(err)))
      return
    }

    events.onListening()

    // popup:false 用插件自己的 RecognitionListener，不弹系统「请说话」框；
    // partialResults:false 时 start() 的 Promise 会一直挂到 onResults / onError，
    // 所以用 .then/.catch 驱动事件，不 await 它，start() 立即返回。
    void plugin
      .start({
        language: 'zh-CN',
        maxResults: 1,
        partialResults: false,
        popup: false,
      })
      .then((res) => {
        const spoken = res.matches?.[0] ?? ''
        this.finish(session, () => {
          if (spoken.trim()) events.onResult(spoken)
          else events.onError({ code: 'no-match' })
        })
      })
      .catch((err: unknown) => {
        // 「没说话 / 没识别到」也是要给人看的失败，不能因为点了停止就吞掉。
        this.finish(session, () => events.onError(asVoiceFailure(err)))
      })

    // 兜底：识别服务异常时别让录音态卡死，给人一句可读提示。
    this.addTimer(
      session,
      window.setTimeout(() => {
        this.finish(session, () => events.onError({ code: 'no-speech' }))
      }, MAX_LISTEN_MS),
    )
  }

  async stop(): Promise<void> {
    const session = this.session
    if (!session || session.settled) return
    try {
      const { SpeechRecognition } = await loadNative()
      // 插件 stop() 的 Promise 不会 resolve（只触发原生收尾，结果仍走 start() 的
      // Promise），所以这里不 await 它，只借它把识别器停下来。
      void SpeechRecognition.stop().catch(() => {})
    } catch {
      // 插件没加载成功也照常收尾。
    }
    this.addTimer(
      session,
      window.setTimeout(() => this.finish(session, () => {}), STOP_FALLBACK_MS),
    )
  }

  async dispose(): Promise<void> {
    await this.stop()
    this.clearTimers()
    this.session = null
  }

  /** 一次会话只允许落地一个终态，避免重复 onEnd / 重复追加。 */
  private finish(session: AndroidSession, emit: () => void): void {
    if (session.settled) return
    session.settled = true
    this.clearTimers(session)
    emit()
    session.events.onEnd()
    if (this.session === session) this.session = null
  }

  private addTimer(session: AndroidSession, id: number): void {
    session.timers.push(id)
  }

  private clearTimers(session: AndroidSession | null = this.session): void {
    if (!session) return
    for (const id of session.timers) window.clearTimeout(id)
    session.timers = []
  }
}

// ---------------------------------------------------------------- 浏览器降级

/** lib.dom 没带 SpeechRecognition 构造器，这里只声明用到的那几个字段。 */
interface WebRecognitionResult {
  isFinal: boolean
  0?: { transcript?: string }
}
interface WebResultEvent extends Event {
  resultIndex: number
  results: ArrayLike<WebRecognitionResult>
}
interface WebErrorEvent extends Event {
  error: string
}
interface WebRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((e: Event) => void) | null
  onresult: ((e: WebResultEvent) => void) | null
  onerror: ((e: WebErrorEvent) => void) | null
  onend: ((e: Event) => void) | null
}
type WebRecognitionCtor = new () => WebRecognition

function webConstructor(): WebRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: WebRecognitionCtor
    webkitSpeechRecognition?: WebRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

class WebVoiceEngine implements VoiceEngine {
  readonly platform: VoicePlatform = 'web'
  private recognition: WebRecognition | null = null
  private listening = false
  private fallback = 0

  async availability(): Promise<VoiceAvailability> {
    if (!webConstructor()) {
      return { available: false, hint: '这个浏览器不支持语音输入，换 Chrome 试试。' }
    }
    return { available: true }
  }

  async isListening(): Promise<boolean> {
    return this.listening
  }

  async start(events: VoiceEvents): Promise<void> {
    const Ctor = webConstructor()
    if (!Ctor) {
      events.onError({ code: 'unsupported' })
      return
    }
    this.teardown()
    const recognition = new Ctor()
    this.recognition = recognition
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      this.listening = true
      events.onListening()
    }
    recognition.onresult = (e) => {
      // 只取最终结果，拼起来交给 UI 追加，不覆盖草稿。
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result?.isFinal) text += result[0]?.transcript ?? ''
      }
      if (text.trim()) events.onResult(text)
    }
    recognition.onerror = (e) => {
      const failure = classifyWebError(e.error)
      // 只有主动取消（aborted）不提示；没说话 / 没识别到要给出可读错误。
      if (failure.code === 'aborted') return
      events.onError(failure)
    }
    recognition.onend = () => {
      this.listening = false
      this.clearFallback()
      this.recognition = null
      events.onEnd()
    }

    try {
      // 浏览器自己会在 start() 里弹麦克风权限；拒绝后 onerror 给 not-allowed。
      recognition.start()
    } catch (err) {
      this.listening = false
      events.onError(asVoiceFailure(err))
      events.onEnd()
      return
    }
    this.fallback = window.setTimeout(() => {
      if (this.listening) void this.stop()
    }, MAX_LISTEN_MS)
  }

  async stop(): Promise<void> {
    const recognition = this.recognition
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      this.teardown()
    }
    // 先撤掉 60s 的总超时，再挂停止兜底，别把旧计时器漏在那儿。
    this.clearFallback()
    this.fallback = window.setTimeout(() => this.teardown(), STOP_FALLBACK_MS)
  }

  async dispose(): Promise<void> {
    this.teardown()
  }

  private clearFallback(): void {
    if (this.fallback) window.clearTimeout(this.fallback)
    this.fallback = 0
  }

  private teardown(): void {
    this.clearFallback()
    const recognition = this.recognition
    this.recognition = null
    this.listening = false
    if (!recognition) return
    recognition.onstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.abort()
    } catch {
      // 已经结束的实例，忽略。
    }
  }
}

/** 按运行环境选实现。UI 只调用这个工厂，之后全走 VoiceEngine 接口。 */
export function createVoiceEngine(): VoiceEngine {
  return Capacitor.isNativePlatform() ? new AndroidVoiceEngine() : new WebVoiceEngine()
}
