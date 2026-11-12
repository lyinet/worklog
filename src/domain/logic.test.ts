import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import { applyFilters, filterByTag, matchesQuery } from './search'
import { summarize } from './stats'
import { toMarkdown } from './export'

function entry(partial: Partial<Entry> & Pick<Entry, 'id' | 'text'>): Entry {
  const at = partial.createdAt ?? new Date(2026, 4, 6, 10, 0).getTime()
  return { tags: [], createdAt: at, updatedAt: at, ...partial }
}

const api = entry({ id: '1', text: '调通 #api 的鉴权', tags: ['api'] })
const bug = entry({ id: '2', text: '修了登录的 bug', tags: ['bug'] })

describe('matchesQuery', () => {
  it('matches Chinese substrings without tokenizing', () => {
    expect(matchesQuery(bug, '登录')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(matchesQuery(api, 'API')).toBe(true)
  })

  it('matches tag prefixes', () => {
    expect(matchesQuery(api, '#ap')).toBe(true)
  })

  it('empty query matches everything', () => {
    expect(matchesQuery(bug, '   ')).toBe(true)
  })

  it('rejects non-matches', () => {
    expect(matchesQuery(bug, '部署')).toBe(false)
  })
})

describe('applyFilters', () => {
  it('combines query and tag', () => {
    expect(applyFilters([api, bug], { query: '修', tag: 'bug' })).toEqual([bug])
    expect(applyFilters([api, bug], { query: '修', tag: 'api' })).toEqual([])
  })

  it('tag filter alone', () => {
    expect(filterByTag([api, bug], 'api')).toEqual([api])
    expect(filterByTag([api, bug], null)).toHaveLength(2)
  })
})

describe('summarize', () => {
  const now = new Date(2026, 4, 6, 12, 0).getTime()

  it('counts today, this week and per-tag totals', () => {
    const list = [
      entry({
        id: 'a',
        text: 'x',
        tags: ['api'],
        createdAt: new Date(2026, 4, 6, 9, 0).getTime(),
      }),
      entry({
        id: 'b',
        text: 'y',
        tags: ['api', 'bug'],
        createdAt: new Date(2026, 4, 5, 9, 0).getTime(),
      }),
      entry({
        id: 'c',
        text: 'z',
        tags: [],
        createdAt: new Date(2026, 3, 20, 9, 0).getTime(),
      }),
    ]
    const s = summarize(list, now)
    expect(s.total).toBe(3)
    expect(s.today).toBe(1)
    expect(s.thisWeek).toBe(2)
    expect(s.activeDays).toBe(3)
    expect(s.tags[0]).toEqual({ tag: 'api', count: 2 })
  })

  it('handles an empty log', () => {
    expect(summarize([], now)).toEqual({
      total: 0,
      today: 0,
      thisWeek: 0,
      activeDays: 0,
      tags: [],
    })
  })
})

describe('toMarkdown', () => {
  it('groups by day and keeps tags', () => {
    const md = toMarkdown([api, bug])
    expect(md).toContain('# 工作记录')
    expect(md).toContain('## 2026-05-06')
    expect(md).toContain('10:00 修了登录的 bug #bug')
  })
})
