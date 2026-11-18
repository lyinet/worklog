import { useRef, useState } from 'react'
import type { Entry } from '../domain/types'
import type { ImportSummary } from '../domain/import'
import { downloadFile, toJSON, toMarkdown } from '../domain/export'
import { CaptureNotificationSetting } from './CaptureNotificationSetting'
import { SummarySheet } from './SummarySheet'

interface MenuSheetProps {
  open: boolean
  entries: readonly Entry[]
  onClose: () => void
  onClearAll: () => Promise<void>
  onOpenStats: () => void
  onImportBackup: (text: string) => Promise<ImportSummary>
}

type ImportResult = { kind: 'ok'; summary: ImportSummary } | { kind: 'error'; message: string }

/** 文件名精确到分钟（本地时区），连续导出也不会互相覆盖。 */
function minuteStamp(): string {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  )
}

export function MenuSheet({
  open,
  entries,
  onClose,
  onClearAll,
  onOpenStats,
  onImportBackup,
}: MenuSheetProps) {
  const [confirming, setConfirming] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  if (summaryOpen) {
    return (
      <SummarySheet
        entries={entries}
        onClose={() => setSummaryOpen(false)}
        onDownload={(markdown) => {
          downloadFile('工作周报-' + minuteStamp() + '.md', markdown, 'text/markdown')
          setSummaryOpen(false)
          onClose()
        }}
      />
    )
  }

  async function handleFile(file: File | undefined) {
    if (!file || importing) return
    setImporting(true)
    setImportResult(null)
    try {
      const summary = await onImportBackup(await file.text())
      setImportResult({ kind: 'ok', summary })
    } catch (cause) {
      setImportResult({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="safe-bottom relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-[#232326] bg-[#131315] p-4">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#2f2f34]" />
        <p className="mb-3 px-1 text-[13px] text-[#5d5d64]">共 {entries.length} 条记录</p>

        <div className="space-y-2">
          <CaptureNotificationSetting open={open} />

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
              downloadFile(`工作记录-${minuteStamp()}.md`, toMarkdown(entries), 'text/markdown')
              onClose()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            导出 Markdown
            <span className="text-[12px] text-[#5d5d64]">按天分组</span>
          </button>

          <button
            onClick={() => setSummaryOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            导出周报
            <span className="text-[12px] text-[#5d5d64]">选范围 · 按标签汇总</span>
          </button>

          <button
            onClick={() => {
              downloadFile(`worklog-${minuteStamp()}.json`, toJSON(entries), 'application/json')
              onClose()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#232326] px-3 py-3 text-[15px] text-[#e6e6e8]"
          >
            导出 JSON 备份
            <span className="text-[12px] text-[#5d5d64]">完整数据 · 精确到分钟</span>
          </button>

          <div className="rounded-xl border border-[#232326] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] text-[#e6e6e8]">从 JSON 备份恢复</span>
              <button
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="shrink-0 rounded-lg border border-[#2f4a3c] bg-[#14201a] px-3 py-2 text-[13px] font-medium text-[#7ee2a8] disabled:opacity-40"
              >
                {importing ? '导入中…' : '选择文件'}
              </button>
            </div>
            <p className="mt-1.5 text-[12px] leading-5 text-[#8b8b90]">
              导入是<strong className="font-medium text-[#c9c9ce]">合并，不是覆盖</strong>
              ：现有记录不会被清空，同 id 保留较新的那条。
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              aria-label="选择 JSON 备份文件"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            {importResult?.kind === 'ok' && (
              <p data-testid="import-result" className="mt-2 rounded-lg bg-[#14201a] px-3 py-2 text-[13px] text-[#7ee2a8]">
                导入完成 · 新增 {importResult.summary.added} 条 · 更新 {importResult.summary.updated} 条 · 跳过{' '}
                {importResult.summary.skipped} 条
              </p>
            )}
            {importResult?.kind === 'error' && (
              <p data-testid="import-result" className="mt-2 rounded-lg bg-[#1d1414] px-3 py-2 text-[13px] text-[#e8b4b4]">
                导入失败：{importResult.message}
              </p>
            )}
          </div>

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
