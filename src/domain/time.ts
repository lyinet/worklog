const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Local calendar day key, `YYYY-MM-DD`. Never use toISOString for this. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Epoch ms of local midnight for the given moment. */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfWeek(ms: number, weekStartsOn = 1): number {
  const day = new Date(ms).getDay()
  const diff = (day - weekStartsOn + 7) % 7
  return startOfDay(ms) - diff * DAY_MS
}

export function isSameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b)
}

/** `09:05` — 24h, no locale surprises. */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `10月8日 周三` */
export function formatDayLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
}

/** Only meaningful for the most recent days, which is where the eye goes first. */
export function relativeDayLabel(ms: number, now = Date.now()): string | null {
  const diffDays = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays === 2) return '前天'
  return null
}

/** Coarse duration for the "已记录 N 天" stat line. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}
