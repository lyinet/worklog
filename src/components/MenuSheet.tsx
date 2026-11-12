import { useState } from 'react'
import type { Entry } from '../domain/types'
import { downloadFile, toJSON, toMarkdown } from '../domain/export'

interface MenuSheetProps {
  open: boolean
  entries: readonly Entry[]
  onClose: () => void
  onClearAll: () => Promise<void>
  onOpenStats: () => void
}

function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export function MenuSheet({ open, entries, onClose, onClearAll, onOpenStats }: MenuSheetProps) {
  const [confirming, setConfirming] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="safe-bottom relative w-full rounded-t-3xl border-t border-[#232326] bg-[#131315] p-4">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#2f2f34]" />
        <p className="mb-3 px-1 text-[13px] text-[#5d5d64]">共 {entries.length} 条记录</p>

        <div className="space-y-2">
          <button
            onClick={() => {
              onClose()
              onOpenStats()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            统计
            <span className="text-[12px] text-[#5d5d64]">连续天数 · 周对比 · 标签</span>
          </button>

          <button
            onClick={() => {
              downloadFile(`工作记录-${todayStamp()}.md`, toMarkdown(entries), 'text/markdown')
              onClose()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            导出 Markdown
            <span className="text-[12px] text-[#5d5d64]">按天分组</span>
          </button>

          <button
            onClick={() => {
              downloadFile(`worklog-${todayStamp()}.json`, toJSON(entries), 'application/json')
              onClose()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            导出 JSON 备份
            <span className="text-[12px] text-[#5d5d64]">完整数据</span>
          </button>

          {confirming ? (
            <div className="rounded-xl border border-[#5a2a2a] bg-[#1d1414] p-3">
              <p className="text-[14px] text-[#e8b4b4]">清空全部 {entries.length} 条记录？不可恢复。</p>
              <div className="mt-2 flex justify-end gap-2 text-[13px]">
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-3 py-1.5 text-[#8b8b90]"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    void onClearAll()
                    setConfirming(false)
                    onClose()
                  }}
                  className="rounded-lg bg-[#e06c6c] px-3 py-1.5 font-medium text-[#150808]"
                >
                  全部清空
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded-xl border border-[#232326] px-3 py-3 text-left text-[15px] text-[#c98b8b]"
            >
              清空全部数据
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-[#1b1b1f] py-3 text-[15px] text-[#8b8b90]"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
