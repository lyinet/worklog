import type { Entry } from '../domain/types'
import { formatClock, dayKey } from '../domain/time'
import { stripTags } from '../domain/tags'

/** Markdown by day, ready to paste into a report or a chat. */
export function toMarkdown(entries: readonly Entry[]): string {
  const byDay = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = dayKey(entry.createdAt)
    const bucket = byDay.get(key)
    if (bucket) bucket.push(entry)
    else byDay.set(key, [entry])
  }

  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  const lines: string[] = ['# 工作记录', '']

  for (const [key, list] of days) {
    lines.push(`## ${key}`, '')
    for (const entry of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
      const tags = entry.tags.length ? ` ${entry.tags.map((t) => `#${t}`).join(' ')}` : ''
      const body = stripTags(entry.text) || entry.text
      lines.push(`- ${formatClock(entry.createdAt)} ${body}${tags}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function toJSON(entries: readonly Entry[]): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
