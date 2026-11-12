import type { Entry } from './types'
import { startOfDay, startOfWeek } from './time'

export interface Summary {
  total: number
  today: number
  thisWeek: number
  /** Days with at least one entry, most recent first. */
  activeDays: number
  tags: TagCount[]
}

export interface TagCount {
  tag: string
  count: number
}

export function summarize(entries: readonly Entry[], now = Date.now(), weekStartsOn = 1): Summary {
  const dayStart = startOfDay(now)
  const weekStart = startOfWeek(now, weekStartsOn)
  const tagTotals = new Map<string, number>()
  const days = new Set<string>()
  let today = 0
  let thisWeek = 0

  for (const entry of entries) {
    if (entry.createdAt >= dayStart) today += 1
    if (entry.createdAt >= weekStart) thisWeek += 1
    days.add(new Date(entry.createdAt).toDateString())
    for (const tag of entry.tags) tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + 1)
  }

  const tags = [...tagTotals.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  return { total: entries.length, today, thisWeek, activeDays: days.size, tags }
}
