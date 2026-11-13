import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { appendVoiceText, clampVoiceText } from '../domain/voiceText'
import { parseTags } from '../domain/tags'
import { voiceMessage } from '../domain/voiceErrors'
import { createVoiceEngine, type VoiceEngine } from '../plugins/voice'
import { MicButton } from './MicButton'
import { VoiceStatus } from './VoiceStatus'

interface CaptureBarProps {
  onAdd: (text: string) => Promise<unknown>
  /** 外部（例如空状态按钮）用来聚焦输入框。 */
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * The whole point of the app: type, hit enter, done. Kept at the bottom of the
 * screen so a thumb can reach it, and it never loses the draft.
 */
export function CaptureBar({ onAdd, inputRef }: CaptureBarProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(0)
  // 语音：录音态 / 状态文案 / 当前平台是否支持。
  const [voiceState, setVoiceState] = useState<{
    status: 'idle' | 'recording' | 'error'
    message: string
  }>({ status: 'idle', message: '' })
  const [voiceReady, setVoiceReady] = useState(true)
  const recording = voiceState.status === 'recording'
  // 中文输入法组合期间别把 Enter 当提交（选词的那一下就是 Enter）。
  const composing = useRef(false)
  // 部分浏览器 compositionend 后才派发 Enter；这个标记在下个事件循环里清掉。
  const justEndedComposition = useRef(false)
  const flashTimer = useRef<number | null>(null)
  const flashSeq = useRef(0)
  const engineRef = useRef<VoiceEngine | null>(null)
  // 识别结果要追加到「当前」草稿末尾，回调里不能拿到过期的 text。
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    inputRef.current?.focus()
    const engine = createVoiceEngine()
    engineRef.current = engine
    void engine.availability().then(({ available, hint }) => {
      setVoiceReady(available)
      if (!available) setVoiceState({ status: 'error', message: hint ?? '这台设备不支持语音输入。' })
    })
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      void engine.dispose()
      engineRef.current = null
    }
  }, [])

  const tags = parseTags(text)

  /** 点麦克风：录音中→停止，空闲→开始。识别结果只追加，不提交。 */
  function toggleVoice() {
    const engine = engineRef.current
    if (!engine || !voiceReady) return
    if (recording) {
      void engine.stop()
      return
    }
    setVoiceState({ status: 'idle', message: '' })
    // 本次录音的标记：onError / onEnd 都可能最后到，靠它决定要不要留错误提示。
    const session = { errored: false }
    void engine.start({
      onListening: () => setVoiceState({ status: 'recording', message: '在听… 说完点一下停止' }),
      onResult: (spoken) => {
        // 只把字放进输入框，光标移到末尾，人改完再回车。
        const next = appendVoiceText(textRef.current, clampVoiceText(spoken))
        setText(next)
        requestAnimationFrame(() => {
          const input = inputRef.current
          if (!input) return
          input.focus()
          const end = input.value.length
          input.setSelectionRange(end, end)
        })
      },
      onError: (failure) => {
        const message = voiceMessage(failure, engine.platform)
        if (!message) return
        session.errored = true
        setVoiceState({ status: 'error', message })
      },
      onEnd: () => {
        // 出错就留着错误给用户看；正常结束收掉状态行。
        if (session.errored) return
        setVoiceState({ status: 'idle', message: '' })
      },
    })
  }

  function dismissVoiceError() {
    setVoiceState({ status: 'idle', message: '' })
  }

  /** 一次极轻的反馈：边框闪一下 + 轻微缩放，180ms 内结束，不堆 toast。 */
  function giveFeedback() {
    const seq = ++flashSeq.current
    setFlash(seq)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      setFlash((current) => (current === seq ? 0 : current))
      flashTimer.current = null
    }, 180)
  }

  /** Enter 提交：组合中 / 刚选完词的那一下不能算提交。 */
  function allowEnterSubmit(): boolean {
    return !composing.current && !justEndedComposition.current
  }

  async function submit() {
    // 空内容、还没写完上一笔，不动。
    if (busy) return
    const value = text.trim()
    if (!value) return
    setBusy(true)
    setText('')
    giveFeedback()
    try {
      await onAdd(value)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="safe-bottom border-t border-[#232326] bg-[#0e0e10]/95 backdrop-blur">
      <form
        className="px-3 pt-2.5 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          // 表单提交只可能来自 Enter 或「记下」按钮；Enter 要过组合状态的闸。
          if (e.nativeEvent instanceof KeyboardEvent && !allowEnterSubmit()) return
          void submit()
        }}
      >
        <VoiceStatus
          status={voiceState.status}
          message={voiceState.message}
          onDismiss={voiceState.status === 'error' ? dismissVoiceError : undefined}
        />
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => {
              composing.current = true
              justEndedComposition.current = false
            }}
            onCompositionEnd={() => {
              composing.current = false
              justEndedComposition.current = true
              window.setTimeout(() => {
                justEndedComposition.current = false
              }, 0)
            }}
            onKeyDown={(e) => {
              // 组合中的 Enter 是选词，不是提交；有些浏览器 keyCode 仍是 229。
              if (e.nativeEvent.isComposing || e.keyCode === 229) {
                if (e.key === 'Enter') e.preventDefault()
                return
              }
              if (e.key === 'Enter' && !text.trim()) e.preventDefault()
            }}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="刚做了什么？ 用 #标签 归类"
            aria-label="记录工作"
            className={[
              'min-w-0 flex-1 rounded-2xl border bg-[#17171a] px-4 py-3 text-[15px] leading-6 text-[#ededed] outline-none placeholder:text-[#5d5d64]',
              'transition-[border-color,box-shadow,transform] duration-[180ms] ease-out',
              flash > 0
                ? 'scale-[1.015] border-[#7ee2a8] shadow-[0_0_0_3px_rgba(126,226,168,0.14)]'
                : 'scale-100 border-[#2a2a2e] focus:border-[#3a3a40]',
            ].join(' ')}
          />
          <MicButton
            recording={recording}
            disabled={!voiceReady}
            onClick={toggleVoice}
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="h-12 shrink-0 rounded-2xl bg-[#7ee2a8] px-5 text-[15px] font-semibold text-[#0b0b0c] transition enabled:hover:bg-[#93ecb8] disabled:opacity-30"
          >
            记下
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-1 text-[12px] text-[#7ee2a8]">
            {tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}
