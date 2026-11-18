import { useState } from 'react'
import type { Entry } from '../domain/types'
import {
  createSummary,
  isSummaryRangeValid,
  summaryRange,
  summaryToMarkdown,
} from '../domain/summary'
import type { SummaryPreset, SummaryRange } from '../domain/summary'

interface SummarySheetProps {
  entries: readonly Entry[]
  onClose: () => void
  onDownload: (markdown: string) => void
}

const PRESETS: { value: SummaryPreset; label: string }[] = [
  { value: 'thisWeek', label: '本周' },
  { value: 'lastWeek', label: '上周' },
  { value: 'recent7', label: '最近 7 天' },
  { value: 'thisMonth', label: '本月' },
]

export function SummarySheet({ entries, onClose, onDownload }: SummarySheetProps) {
  const [preset, setPreset] = useState<SummaryPreset | 'custom'>('thisWeek')
  const [range, setRange] = useState<SummaryRange>(() => summaryRange('thisWeek'))
  const valid = isSummaryRangeValid(range)
  const summary = valid ? createSummary(entries, range) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <button
        aria-label="关闭周报"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="safe-bottom relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-[#232326] bg-[#131315] p-4">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#2f2f34]" />
        <h2 id="summary-title" className="mb-3 px-1 text-[15px] font-semibold text-[#f2f2f4]">导出周报</h2>

        <label className="block text-[13px] text-[#8b8b90]">
          时间范围
          <select
            autoFocus
            value={preset}
            onChange={(event) => {
              const value = event.target.value as SummaryPreset | 'custom'
              setPreset(value)
              if (value !== 'custom') setRange(summaryRange(value))
            }}
            className="mt-2 w-full rounded-xl border border-[#232326] bg-[#1b1b1f] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            {PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="custom">自选日期</option>
          </select>
        </label>

        {preset === 'custom' && (
          <div className="mt-3 space-y-3">
            <label className="block text-[13px] text-[#8b8b90]">
              开始日期
              <input
                type="date"
                value={range.start}
                onChange={(event) => setRange({ ...range, start: event.target.value })}
                className="mt-1 w-full min-w-0 rounded-xl border border-[#232326] bg-[#1b1b1f] px-3 py-3 text-[15px] text-[#e6e6e8] [color-scheme:dark]"
              />
            </label>
            <label className="block text-[13px] text-[#8b8b90]">
              结束日期
              <input
                type="date"
                value={range.end}
                min={range.start}
                onChange={(event) => setRange({ ...range, end: event.target.value })}
                className="mt-1 w-full min-w-0 rounded-xl border border-[#232326] bg-[#1b1b1f] px-3 py-3 text-[15px] text-[#e6e6e8] [color-scheme:dark]"
              />
            </label>
          </div>
        )}

        <div aria-live="polite" className="mt-4 rounded-xl border border-[#232326] bg-[#1b1b1f] px-3 py-3 text-[13px] leading-6 text-[#8b8b90]">
          {summary ? (
            <>
              <p className="break-words tabular-nums text-[#c9c9ce]">{summary.rangeLabel}</p>
              <p>共 {summary.total} 条记录 · 有记录 {summary.activeDays} 天</p>
              <p>{summary.total === 0 ? '这段时间没有记录，仍可导出空周报。' : '按标签归组，附每天的时间线。多标签记录会出现在各组。'}</p>
            </>
          ) : <p className="text-[#e8b4b4]">请选择有效日期，结束日期不能早于开始日期。</p>}
        </div>

        <button
          disabled={!summary}
          onClick={() => {
            if (summary) onDownload(summaryToMarkdown(summary))
          }}
          className="mt-4 w-full rounded-xl border border-[#2f4a3c] bg-[#14201a] py-3 text-[15px] font-medium text-[#7ee2a8] disabled:opacity-40"
        >
          下载 Markdown
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-xl bg-[#1b1b1f] py-3 text-[15px] text-[#8b8b90]">
          返回菜单
        </button>
      </div>
    </div>
  )
}
