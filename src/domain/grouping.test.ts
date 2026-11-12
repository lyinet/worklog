import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import { groupByDay } from './grouping'
import { dayKey, formatClock, relativeDayLabel, startOfWeek } from './time'

function entry(id: string, text: string, iso: string): Entry {
  return {
    id,
    text,
    tags: [],
    createdAt: new Date(iso).getTime(),
    updatedAt: new Date(iso).getTime(),
  }
}

describe('dayKey', () => {
  it('uses local time, not UTC', () => {
    // 2026-01-01T00:30 local is still Jan 1 locally even when UTC is Dec 31.
    const ms = new Date(2026, 0, 1, 0, 30).getTime()
    expect(dayKey(ms)).toBe('2026-01-01')
  })
})

describe('formatClock', () => {
  it('pads to HH:MM', () => {
    expect(formatClock(new Date(2026, 4, 6, 9, 5).getTime())).toBe('09:05')
  })
})

describe('startOfWeek', () => {
  it('starts on Monday by default', () => {
    const wed = new Date(2026, 4, 6, 15, 0).getTime()
    expect(new Date(startOfWeek(wed)).getDay()).toBe(1)
  })
})

describe('relativeDayLabel', () => {
  const now = new Date(2026, 4, 6, 12, 0).getTime()

  it('labels today, yesterday and the day before', () => {
    expect(relativeDayLabel(new Date(2026, 4, 6, 1, 0).getTime(), now)).toBe('今天')
    expect(relativeDayLabel(new Date(2026, 4, 5, 23, 0).getTime(), now)).toBe('昨天')
    expect(relativeDayLabel(new Date(2026, 4, 4, 9, 0).getTime(), now)).toBe('前天')
  })

  it('returns null for older days', () => {
    expect(relativeDayLabel(new Date(2026, 4, 1).getTime(), now)).toBeNull()
  })
})

describe('groupByDay', () => {
  const now = new Date(2026, 4, 6, 12, 0).getTime()

  it('groups by local day, newest day first', () => {
    const groups = groupByDay(
      [
        entry('a', 'old', '2026-05-04T10:00:00'),
        entry('b', 'new', '2026-05-06T09:00:00'),
        entry('c', 'mid', '2026-05-05T18:00:00'),
      ],
      now,
    )
    expect(groups.map((g) => g.key)).toEqual(['2026-05-06', '2026-05-05', '2026-05-04'])
    expect(groups[0]?.relative).toBe('今天')
  })

  it('sorts entries newest first inside a day', () => {
    const groups = groupByDay(
      [
        entry('a', 'morning', '2026-05-06T08:00:00'),
        entry('b', 'evening', '2026-05-06T20:00:00'),
      ],
      now,
    )
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('returns an empty list for no entries', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})
