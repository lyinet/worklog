import { useState } from 'react'
import type { Entry } from '../domain/types'
import { formatClock } from '../domain/time'
import { RichText } from './RichText'

interface EntryRowProps {
  entry: Entry
  onUpdate: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTagClick: (tag: string) => void
}

export function EntryRow({ entry, onUpdate, onDelete, onTagClick }: EntryRowProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(entry.text)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      if (draft.trim() && draft.trim() !== entry.text) await onUpdate(entry.id, draft)
      setMode('view')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await onDelete(entry.id)
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-2xl border border-[#3a3a40] bg-[#17171a] p-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full resize-none bg-transparent text-[15px] leading-6 text-[#ededed] outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMode('view')
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
          }}
        />
        <div className="mt-2 flex justify-end gap-2 text-[13px]">
          <button
            onClick={() => {
              setDraft(entry.text)
              setMode('view')
            }}
            className="rounded-lg px-3 py-1.5 text-[#8b8b90]"
          >
            取消
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-[#7ee2a8] px-3 py-1.5 font-medium text-[#0b0b0c] disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'delete') {
    return (
      <div className="rounded-2xl border border-[#4a2626] bg-[#1a1212] p-3">
        <p className="text-[14px] text-[#e8b4b4]">删除这条记录？</p>
        <p className="mt-1 line-clamp-2 text-[13px] text-[#8b8b90]">{entry.text}</p>
        <div className="mt-2 flex justify-end gap-2 text-[13px]">
          <button onClick={() => setMode('view')} className="rounded-lg px-3 py-1.5 text-[#8b8b90]">
            取消
          </button>
          <button
            onClick={() => void confirmDelete()}
            disabled={busy}
            className="rounded-lg bg-[#e06c6c] px-3 py-1.5 font-medium text-[#150808] disabled:opacity-40"
          >
            删除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start gap-2 py-2.5">
        <time className="mt-1 w-11 shrink-0 font-mono text-[12px] tabular-nums text-[#53535a]">
          {formatClock(entry.createdAt)}
        </time>
        <div className="min-w-0 flex-1 pt-0.5" onClick={() => setExpanded((v) => !v)}>
          <RichText text={entry.text} onTagClick={onTagClick} />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label="操作"
          aria-expanded={expanded}
          className="mt-0.5 shrink-0 px-1 py-1 text-[14px] leading-none text-[#3a3a41] active:text-[#8b8b90]"
        >
          ⋯
        </button>
      </div>

      {expanded && (
        <div className="mb-2 flex gap-1.5 pl-[52px]">
          <button
            onClick={() => {
              setDraft(entry.text)
              setExpanded(false)
              setMode('edit')
            }}
            className="rounded-lg border border-[#2a2a2e] px-3 py-1.5 text-[13px] text-[#9a9aa2]"
          >
            编辑
          </button>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(entry.text)
              setExpanded(false)
            }}
            className="rounded-lg border border-[#2a2a2e] px-3 py-1.5 text-[13px] text-[#9a9aa2]"
          >
            复制
          </button>
          <button
            onClick={() => {
              setExpanded(false)
              setMode('delete')
            }}
            className="rounded-lg border border-[#3a2626] px-3 py-1.5 text-[13px] text-[#c98b8b]"
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
