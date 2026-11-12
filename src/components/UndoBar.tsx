import { useEffect, useState } from 'react'
import { REMOVAL_WINDOW_MS, type PendingRemoval } from '../domain/removal'

interface UndoBarProps {
  pending: PendingRemoval | null
  onUndo: () => void
}

const R = 9
const CIRC = 2 * Math.PI * R

/** 删除后的底部撤销条：5 秒倒计时，深色卡片 + 薄荷绿撤销按钮。 */
export function UndoBar({ pending, onUndo }: UndoBarProps) {
  const [nowTick, setNowTick] = useState(() => Date.now())

  // 40ms 一跳只驱动细环；窗口切换时立刻重置，倒计时不会串到上一条。
  useEffect(() => {
    if (!pending) return
    setNowTick(Date.now())
    const timer = window.setInterval(() => setNowTick(Date.now()), 40)
    return () => window.clearInterval(timer)
  }, [pending])

  if (!pending) return null

  const remain = Math.max(0, pending.deadline - nowTick)
  const ratio = Math.min(1, remain / REMOVAL_WINDOW_MS)
  const seconds = Math.ceil(remain / 1000)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+88px)]">
      <div className="animate-undo-in pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl border border-[#303036] bg-[#1b1b1f] px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
            <circle cx="12" cy="12" r={R} fill="none" stroke="#3a3a40" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke="#7ee2a8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - ratio)}
            />
          </svg>
          <span className="absolute font-mono text-[9px] tabular-nums text-[#c9c9ce]">
            {seconds}
          </span>
        </span>

        <span className="min-w-0 flex-1 text-[13px] text-[#c9c9ce]">
          已删除 <span className="mx-1 text-[#5d5d64]">·</span> 可撤销
        </span>

        <button
          type="button"
          onClick={onUndo}
          aria-label="撤销删除"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#7ee2a8] px-4 text-[14px] font-semibold text-[#0b0b0c] transition active:scale-95 enabled:hover:bg-[#93ecb8]"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
            <path
              d="M7 5 3 9l4 4M3.5 9H12a4.5 4.5 0 1 1 0 9H8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          撤销
        </button>
      </div>
    </div>
  )
}
