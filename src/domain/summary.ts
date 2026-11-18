import type { DayGroup, Entry } from './types'
import { groupByDay } from './grouping'
import { dayKey, formatClock, startOfDay } from './time'

export type SummaryPreset = 'thisWeek' | 'lastWeek' | 'recent7' | 'thisMonth'

export interface SummaryRange {
  start: string
  end: string
}

export interface SummaryTagGroup {
  tag: string | null
  entries: Entry[]
}

export interface WorkSummary {
  range: SummaryRange
  rangeLabel: string
  total: number
  activeDays: number
  tags: SummaryTagGroup[]
  timeline: DayGroup<Entry>[]
}

export function summaryRange(preset: SummaryPreset, now = Date.now()): SummaryRange {
  const today = new Date(startOfDay(now))
  const year = today.getFullYear()
  const month = today.getMonth()
  const date = today.getDate()
  const monday = date - (today.getDay() + 6) % 7
  let start: Date
  let end: Date

  switch (preset) {
    case 'thisWeek':
      start = new Date(year, month, monday)
      end = new Date(year, month, monday + 6)
      break
    case 'lastWeek':
      start = new Date(year, month, monday - 7)
      end = new Date(year, month, monday - 1)
      break
    case 'recent7':
      start = new Date(year, month, date - 6)
      end = today
      break
    case 'thisMonth':
      start = new Date(year, month, 1)
      end = new Date(year, month + 1, 0)
      break
  }

  return { start: dayKey(start.getTime()), end: dayKey(end.getTime()) }
}

function validDay(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const date = new Date(key + 'T00:00:00')
  return Number.isFinite(date.getTime()) && dayKey(date.getTime()) === key
}

export function isSummaryRangeValid(range: SummaryRange): boolean {
  return validDay(range.start) && validDay(range.end) && range.start <= range.end
}

export function createSummary(entries: readonly Entry[], range: SummaryRange): WorkSummary {
  if (!isSummaryRangeValid(range)) throw new Error('请选择有效的日期范围')

  const selected = entries.filter((entry) => {
    const key = dayKey(entry.createdAt)
    return key >= range.start && key <= range.end
  }).sort((first, second) => first.createdAt - second.createdAt)
  const buckets = new Map<string | null, Entry[]>()
  for (const entry of selected) {
    const tags = entry.tags.length ? [...new Set(entry.tags)] : [null]
    for (const tag of tags) {
      const bucket = buckets.get(tag)
      if (bucket) bucket.push(entry)
      else buckets.set(tag, [entry])
    }
  }

  const tags = [...buckets.entries()]
    .map(([tag, list]) => ({ tag, entries: list }))
    .sort((first, second) => second.entries.length - first.entries.length
      || (first.tag ?? '未分类').localeCompare(second.tag ?? '未分类'))
  const timeline = groupByDay(selected, new Date(range.end + 'T00:00:00').getTime())
    .reverse()
    .map((group) => ({ ...group, entries: [...group.entries].reverse() }))

  return {
    range: { ...range },
    rangeLabel: range.start + ' ~ ' + range.end,
    total: selected.length,
    activeDays: timeline.length,
    tags,
    timeline,
  }
}

export function summaryBody(text: string): string {
  return text.trim() ? text : text + '（无正文）'
}

function entryBody(entry: Entry): string {
  return summaryBody(entry.text).replace(/(\r?\n)/g, '$1  ')
}

export function summaryToMarkdown(summary: WorkSummary): string {
  const lines = [
    '# 工作周报 · ' + summary.rangeLabel,
    '',
    '共 ' + summary.total + ' 条记录 · 有记录 ' + summary.activeDays + ' 天',
    '',
  ]

  if (summary.total === 0) {
    lines.push('这段时间没有记录。', '')
    return lines.join('\n')
  }

  for (const group of summary.tags) {
    lines.push('## ' + (group.tag === null ? '未分类' : '#' + group.tag), '')
    for (const entry of group.entries) {
      lines.push('- ' + dayKey(entry.createdAt) + ' ' + formatClock(entry.createdAt) + ' ' + entryBody(entry))
    }
    lines.push('')
  }

  lines.push('## 时间线', '')
  for (const day of summary.timeline) {
    lines.push('### ' + day.label, '')
    for (const entry of day.entries) {
      lines.push('- ' + formatClock(entry.createdAt) + ' ' + entryBody(entry))
    }
    lines.push('')
  }

  lines.pop()
  return lines.join('\n') + '\n'
}
