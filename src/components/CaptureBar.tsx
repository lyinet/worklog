import { useEffect, useRef, useState } from 'react'
import { parseTags } from '../domain/tags'

interface CaptureBarProps {
  onAdd: (text: string) => Promise<unknown>
}

/**
 * The whole point of the app: type, hit enter, done. Kept at the bottom of the
 * screen so a thumb can reach it, and it never loses the draft.
 */
export function CaptureBar({ onAdd }: CaptureBarProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 中文输入法组合期间别把 Enter 当提交（选词的那一下就是 Enter）。
  const composing = useRef(false)
  // 部分浏览器 compositionend 后才派发 Enter；这个标记在下个事件循环里清掉。
  const justEndedComposition = useRef(false)
  const flashTimer = useRef<number | null>(null)
  const flashSeq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  const tags = parseTags(text)

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
