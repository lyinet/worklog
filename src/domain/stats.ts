import type { Entry } from './types'
import { dayKey, startOfDay, startOfWeek } from './time'

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

/** One cell of the 30-day heatmap. */
export interface DayCount {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string
  count: number
}

export interface WeekCompare {
  thisWeek: number
  lastWeek: number
  /** 相对上周的百分比变化（四舍五入）。上周 0 条时为 null，避免除零 / NaN。 */
  deltaPct: number | null
}

/** Everything the stats sheet needs, computed from one `now` snapshot. */
export interface Stats {
  total: number
  streak: number
  week: WeekCompare
  days: DayCount[]
  tags: TagCount[]
}

/** 每本地日的条数。统计一律以 dayKey 分桶，不碰 UTC。 */
function countByDay(entries: readonly Entry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = dayKey(entry.createdAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * 最近 `days` 个本地日的 key，从旧到新，最后一天是 `now` 当天。
 * 用日历日构造而不是减 86400000，跨 DST / 跨月都不会错一天。
 */
function recentDayKeys(now: number, days: number): string[] {
  const base = new Date(startOfDay(now))
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)
    keys.push(dayKey(d.getTime()))
  }
  return keys
}

/** 本周与上周围起始日的 key。同样走日历日，避开 ms 运算的 DST 偏移。 */
function weekStartKeys(now: number, weekStartsOn: number): [lastWeek: string, thisWeek: string] {
  const base = new Date(startOfDay(now))
  const diff = (base.getDay() - weekStartsOn + 7) % 7
  const thisStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - diff)
  const lastStart = new Date(
    thisStart.getFullYear(),
    thisStart.getMonth(),
    thisStart.getDate() - 7,
  )
  return [dayKey(lastStart.getTime()), dayKey(thisStart.getTime())]
}

function countTags(entries: readonly Entry[]): TagCount[] {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.tags) totals.set(tag, (totals.get(tag) ?? 0) + 1)
  }
  return [...totals.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function summarize(entries: readonly Entry[], now = Date.now(), weekStartsOn = 1): Summary {
  const dayStart = startOfDay(now)
  const weekStart = startOfWeek(now, weekStartsOn)
  const days = new Set<string>()
  let today = 0
  let thisWeek = 0

  for (const entry of entries) {
    if (entry.createdAt >= dayStart) today += 1
    if (entry.createdAt >= weekStart) thisWeek += 1
    days.add(dayKey(entry.createdAt))
  }

  return { total: entries.length, today, thisWeek, activeDays: days.size, tags: countTags(entries) }
}

/**
 * 连续记录天数：从今天往回数有记录的日子。
 * 今天没记但昨天记了，仍算连续（从昨天接着数）；再往前断档就归零。
 */
export function streakDays(entries: readonly Entry[], now = Date.now()): number {
  const counts = countByDay(entries)
  if (counts.size === 0) return 0

  const base = new Date(startOfDay(now))
  const active = (offset: number): boolean => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset)
    return (counts.get(dayKey(d.getTime())) ?? 0) > 0
  }

  const start = active(0) ? 0 : active(1) ? 1 : -1
  if (start < 0) return 0

  // 上界用不同天数，保证一定会遇到空格而停，不会死循环。
  let streak = 0
  for (let i = 0; i <= counts.size; i++) {
    if (!active(start + i)) break
    streak += 1
  }
  return streak
}

/** 本周 vs 上周条数。周起点跟随 `weekStartsOn`（默认周一）。 */
export function weekCompare(
  entries: readonly Entry[],
  now = Date.now(),
  weekStartsOn = 1,
): WeekCompare {
  const [lastKey, thisKey] = weekStartKeys(now, weekStartsOn)
  let thisWeek = 0
  let lastWeek = 0

  for (const [key, count] of countByDay(entries)) {
    if (key >= thisKey) thisWeek += count
    else if (key >= lastKey) lastWeek += count
  }

  const deltaPct =
    lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
  return { thisWeek, lastWeek, deltaPct }
}

/** 最近 `days` 天每日条数，从旧到新；没有记录的日子补 0，热力图可直接铺。 */
export function dailyCounts(
  entries: readonly Entry[],
  now = Date.now(),
  days = 30,
): DayCount[] {
  const length = Math.max(0, Math.floor(days))
  const counts = countByDay(entries)
  return recentDayKeys(now, length).map((key) => ({ key, count: counts.get(key) ?? 0 }))
}

/** 标签分布：按条数降序，同数按名字排，取前 `limit` 个。 */
export function tagDistribution(entries: readonly Entry[], limit = 8): TagCount[] {
  return countTags(entries).slice(0, Math.max(0, Math.floor(limit)))
}

/** 面板一次算完，共用一个 `now`，避免跨午夜时各块对不上。 */
export function computeStats(
  entries: readonly Entry[],
  now = Date.now(),
  weekStartsOn = 1,
): Stats {
  return {
    total: entries.length,
    streak: streakDays(entries, now),
    week: weekCompare(entries, now, weekStartsOn),
    days: dailyCounts(entries, now),
    tags: tagDistribution(entries),
  }
}
