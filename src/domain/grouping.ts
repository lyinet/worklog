import type { DayGroup, Entry } from './types'
import { dayKey, formatDayLabel, relativeDayLabel } from './time'

/**
 * Group entries into local days, newest day first and newest entry first
 * within each day. Input order does not matter.
 */
export function groupByDay(entries: readonly Entry[], now = Date.now()): DayGroup<Entry>[] {
  const buckets = new Map<string, Entry[]>()

  for (const entry of entries) {
    const key = dayKey(entry.createdAt)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entry)
    else buckets.set(key, [entry])
  }

  return [...buckets.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt)
      const first = sorted[0]
      if (!first) throw new Error('empty day bucket')
      return {
        key,
        label: formatDayLabel(first.createdAt),
        relative: relativeDayLabel(first.createdAt, now),
        entries: sorted,
        at: first.createdAt,
      }
    })
    .sort((a, b) => b.at - a.at)
    .map(({ at: _at, ...group }) => group)
}
