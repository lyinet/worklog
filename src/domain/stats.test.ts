import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import {
  computeStats,
  dailyCounts,
  streakDays,
  summarize,
  tagDistribution,
  weekCompare,
} from './stats'

/** 用本地日历时间构造，测试不依赖运行环境的时区。 */
function entry(id: string, y: number, m: number, d: number, tags: string[] = []): Entry {
  const createdAt = new Date(y, m - 1, d, 10, 0).getTime()
  return { id, text: id, tags, createdAt, updatedAt: createdAt }
}

// 2026-05-06 周三 12:00（本地）
const NOW = new Date(2026, 4, 6, 12, 0).getTime()

describe('streakDays', () => {
  it('空日志返回 0', () => {
    expect(streakDays([], NOW)).toBe(0)
  })

  it('只记了今天 → 1', () => {
    expect(streakDays([entry('a', 2026, 5, 6)], NOW)).toBe(1)
  })

  it('今天、昨天、前天都记了 → 3', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 5, 5),
      entry('c', 2026, 5, 4),
    ]
    expect(streakDays(list, NOW)).toBe(3)
  })

  it('今天没记但昨天记了，仍算连续（从昨天接着数）', () => {
    const list = [entry('b', 2026, 5, 5), entry('c', 2026, 5, 4)]
    expect(streakDays(list, NOW)).toBe(2)
  })

  it('今天和昨天都没记，断了就归零（哪怕更早有长连续）', () => {
    const list = [
      entry('a', 2026, 5, 3),
      entry('b', 2026, 5, 2),
      entry('c', 2026, 5, 1),
    ]
    expect(streakDays(list, NOW)).toBe(0)
  })

  it('连续中间断一天就停', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 5, 5),
      // 5 月 4 日空档
      entry('c', 2026, 5, 3),
    ]
    expect(streakDays(list, NOW)).toBe(2)
  })

  it('同一天多条只算一天', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 5, 6),
      entry('c', 2026, 5, 6),
      entry('d', 2026, 5, 5),
    ]
    expect(streakDays(list, NOW)).toBe(2)
  })

  it('跨月连续', () => {
    const now = new Date(2026, 4, 1, 12, 0).getTime()
    const list = [entry('a', 2026, 5, 1), entry('b', 2026, 4, 30)]
    expect(streakDays(list, now)).toBe(2)
  })

  it('跨年连续', () => {
    const now = new Date(2026, 0, 1, 12, 0).getTime()
    const list = [entry('a', 2026, 1, 1), entry('b', 2025, 12, 31)]
    expect(streakDays(list, now)).toBe(2)
  })
})

describe('weekCompare', () => {
  it('本周 vs 上周，默认周一起算', () => {
    const list = [
      entry('a', 2026, 5, 4), // 周一，本周
      entry('b', 2026, 5, 5),
      entry('c', 2026, 5, 6),
      entry('d', 2026, 4, 28), // 上周
      entry('e', 2026, 5, 2), // 上周六
    ]
    expect(weekCompare(list, NOW)).toEqual({ thisWeek: 3, lastWeek: 2, deltaPct: 50 })
  })

  it('上周 0 条时 deltaPct 为 null，不除零、不出 NaN', () => {
    const list = [entry('a', 2026, 5, 6), entry('b', 2026, 5, 5)]
    const result = weekCompare(list, NOW)
    expect(result).toEqual({ thisWeek: 2, lastWeek: 0, deltaPct: null })
    expect(Number.isNaN(result.deltaPct)).toBe(false)
  })

  it('空日志全是 0 且 deltaPct 为 null', () => {
    expect(weekCompare([], NOW)).toEqual({ thisWeek: 0, lastWeek: 0, deltaPct: null })
  })

  it('比上周少时为负百分比', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 4, 27),
      entry('c', 2026, 4, 28),
      entry('d', 2026, 4, 29),
      entry('e', 2026, 4, 30),
    ]
    expect(weekCompare(list, NOW).deltaPct).toBe(-75)
  })

  it('respects weekStartsOn=0（周日起算）', () => {
    // 5 月 3 日是周日：周一起算属上周，周日起算属本周
    const list = [entry('a', 2026, 5, 3)]
    expect(weekCompare(list, NOW, 1)).toEqual({ thisWeek: 0, lastWeek: 1, deltaPct: -100 })
    expect(weekCompare(list, NOW, 0)).toEqual({ thisWeek: 1, lastWeek: 0, deltaPct: null })
  })

  it('同一天多条按条数累加', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 5, 6),
      entry('c', 2026, 4, 29),
    ]
    expect(weekCompare(list, NOW)).toEqual({ thisWeek: 2, lastWeek: 1, deltaPct: 100 })
  })
})

describe('dailyCounts', () => {
  it('默认返回 30 天，从旧到新，最后一天是今天', () => {
    const days = dailyCounts([], NOW)
    expect(days).toHaveLength(30)
    expect(days[0]?.key).toBe('2026-04-07')
    expect(days[29]?.key).toBe('2026-05-06')
    expect(days.every((d) => d.count === 0)).toBe(true)
  })

  it('跨月的窗口里按 dayKey 填条数，空日补 0', () => {
    const list = [
      entry('a', 2026, 5, 6),
      entry('b', 2026, 5, 6),
      entry('c', 2026, 5, 5),
      entry('d', 2026, 4, 7), // 窗口第一天
      entry('outside', 2026, 4, 1), // 窗口外，忽略
    ]
    const days = dailyCounts(list, NOW)
    const byKey = new Map(days.map((d) => [d.key, d.count]))
    expect(byKey.get('2026-05-06')).toBe(2)
    expect(byKey.get('2026-05-05')).toBe(1)
    expect(byKey.get('2026-04-07')).toBe(1)
    expect(byKey.get('2026-04-08')).toBe(0)
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(4)
  })

  it('days=0 返回空数组', () => {
    expect(dailyCounts([], NOW, 0)).toEqual([])
  })

  it('自定义天数', () => {
    const days = dailyCounts([], NOW, 7)
    expect(days).toHaveLength(7)
    expect(days[0]?.key).toBe('2026-04-30')
    expect(days[6]?.key).toBe('2026-05-06')
  })
})

describe('tagDistribution', () => {
  it('按条数降序，同数按名字排，取前 8', () => {
    const list = [
      entry('a', 2026, 5, 6, ['api', 'bug']),
      entry('b', 2026, 5, 6, ['api']),
      entry('c', 2026, 5, 5, ['bug']),
      entry('d', 2026, 5, 4, ['deploy']),
      entry('e', 2026, 5, 3, ['test']),
      entry('f', 2026, 5, 2, ['x1']),
      entry('g', 2026, 5, 1, ['x2']),
      entry('h', 2026, 4, 30, ['x3']),
      entry('i', 2026, 4, 29, ['x4']),
      entry('j', 2026, 4, 28, ['x5']),
      entry('k', 2026, 4, 27, ['x6']),
    ]
    const tags = tagDistribution(list)
    expect(tags).toHaveLength(8)
    expect(tags[0]).toEqual({ tag: 'api', count: 2 })
    expect(tags[1]).toEqual({ tag: 'bug', count: 2 })
    // 剩下全是 1 条，按字母序，取到 x4 为止
    expect(tags.slice(2).map((t) => t.tag)).toEqual(['deploy', 'test', 'x1', 'x2', 'x3', 'x4'])
  })

  it('空日志返回空数组', () => {
    expect(tagDistribution([])).toEqual([])
  })

  it('limit=0 返回空数组', () => {
    expect(tagDistribution([entry('a', 2026, 5, 6, ['api'])], 0)).toEqual([])
  })
})

describe('computeStats', () => {
  it('一次算完所有块，且共用一个 now', () => {
    const list = [
      entry('a', 2026, 5, 6, ['api']),
      entry('b', 2026, 5, 5, ['api']),
      entry('c', 2026, 5, 4),
    ]
    const s = computeStats(list, NOW)
    expect(s.total).toBe(3)
    expect(s.streak).toBe(3)
    expect(s.week.thisWeek).toBe(3)
    expect(s.days).toHaveLength(30)
    expect(s.tags[0]).toEqual({ tag: 'api', count: 2 })
  })

  it('0 条记录时没有 NaN / Infinity', () => {
    const s = computeStats([], NOW)
    expect(s.total).toBe(0)
    expect(s.streak).toBe(0)
    expect(s.week).toEqual({ thisWeek: 0, lastWeek: 0, deltaPct: null })
    expect(s.days).toHaveLength(30)
    expect(s.days.every((d) => d.count === 0)).toBe(true)
    expect(s.tags).toEqual([])
    expect(Number.isNaN(s.week.deltaPct)).toBe(false)
    expect(JSON.stringify(s)).not.toContain('null,')
  })
})

describe('summarize (回归)', () => {
  it('仍按本地 dayKey 统计活跃天数，行为不变', () => {
    const list = [
      entry('a', 2026, 5, 6, ['api']),
      entry('b', 2026, 5, 5, ['api', 'bug']),
      entry('c', 2026, 3, 20),
    ]
    const s = summarize(list, NOW)
    expect(s.total).toBe(3)
    expect(s.today).toBe(1)
    // 3 月 20 日那条不在本周（周一 5 月 4 日起）
    expect(s.thisWeek).toBe(2)
    expect(s.activeDays).toBe(3)
    expect(s.tags[0]).toEqual({ tag: 'api', count: 2 })
  })
})
