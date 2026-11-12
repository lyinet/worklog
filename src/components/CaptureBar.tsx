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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const tags = parseTags(text)

  async function submit() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setText('')
    try {
      await onAdd(value)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="border-t border-[#232326] bg-[#0e0e10]/95 backdrop-blur">
      <form
        className="px-3 pt-2.5 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="刚做了什么？ 用 #标签 归类"
            aria-label="记录工作"
            className="min-w-0 flex-1 rounded-2xl border border-[#2a2a2e] bg-[#17171a] px-4 py-3 text-[15px] leading-6 text-[#ededed] outline-none placeholder:text-[#5d5d64] focus:border-[#3a3a40]"
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
