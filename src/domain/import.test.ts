import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import { importSummary, mergeEntries, parseBackup } from './import'

const now = new Date(2026, 4, 6, 12, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

function entry(partial: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    text: '一条记录',
    tags: [],
    createdAt: now - DAY,
    updatedAt: now - DAY,
    ...partial,
  }
}

function backup(entries: unknown[], version: unknown = 1): string {
  return JSON.stringify({ version, exportedAt: new Date(now).toISOString(), entries })
}

describe('parseBackup', () => {
  it('parses a round-tripped export', () => {
    const e = entry({ id: 'a', text: '调通 #api', tags: ['api'] })
    expect(parseBackup(backup([e]), now)).toEqual({ entries: [e], invalid: 0 })
  })

  it('skips bad entries and counts them', () => {
    const good = entry({ id: 'ok', text: '正常' })
    const bad = [
      null,
      'not an object',
      { ...good, id: '' },
      { ...good, id: 42 },
      { ...good, text: 3 },
      { ...good, tags: 'api' },
      { ...good, tags: ['api', 7] },
      { ...good, createdAt: 'yesterday' },
      { ...good, updatedAt: Number.NaN },
      { ...good, updatedAt: Infinity },
      { ...good, createdAt: 0 },
      { ...good, createdAt: 1700000000 },
      { ...good, createdAt: now + 30 * DAY },
      { ...good, updatedAt: good.createdAt - 1 },
    ]
    const result = parseBackup(backup([...bad, good]), now)
    expect(result.entries).toEqual([good])
    expect(result.invalid).toBe(bad.length)
  })

  it('drops extra fields so a deletion marker cannot be restored', () => {
    const e = { ...entry({ id: 'a' }), deleteAfter: now + 5000, extra: 'x' }
    const result = parseBackup(backup([e]), now)
    expect(result.entries[0]).toEqual(entry({ id: 'a' }))
    expect(result.entries[0]).not.toHaveProperty('deleteAfter')
  })

  it('accepts an empty entries array', () => {
    expect(parseBackup(backup([]), now)).toEqual({ entries: [], invalid: 0 })
  })

  it('throws readable errors for broken JSON', () => {
    expect(() => parseBackup('{oops', now)).toThrow(/JSON 解析失败/)
    expect(() => parseBackup('null', now)).toThrow(/顶层应该是一个对象/)
    expect(() => parseBackup('[]', now)).toThrow(/顶层应该是一个对象/)
  })

  it('throws readable errors for a wrong structure', () => {
    expect(() => parseBackup(backup([], 2), now)).toThrow(/version 必须是 1/)
    expect(() => parseBackup(JSON.stringify({ entries: [] }), now)).toThrow(/version 必须是 1/)
    expect(() => parseBackup(JSON.stringify({ version: 1 }), now)).toThrow(/entries 应该是数组/)
    expect(() => parseBackup(JSON.stringify({ version: 1, entries: {} }), now)).toThrow(
      /entries 应该是数组/,
    )
  })

  it('allows a modest future timestamp for clock skew', () => {
    const e = entry({ id: 'a', createdAt: now + 60_000, updatedAt: now + 60_000 })
    expect(parseBackup(backup([e]), now).invalid).toBe(0)
  })
})

describe('mergeEntries', () => {
  it('adds new ids and keeps the existing order-independent list', () => {
    const existing = [entry({ id: 'a', createdAt: now - 3 * DAY })]
    const incoming = [entry({ id: 'b', createdAt: now - DAY })]
    const result = mergeEntries(existing, incoming)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.merged.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('keeps the newer version on id conflict', () => {
    const old = entry({ id: 'a', text: '旧', updatedAt: now - 2 * DAY })
    const newer = entry({ id: 'a', text: '新', updatedAt: now - DAY })
    const result = mergeEntries([old], [newer])
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 0 })
    expect(result.merged[0]).toBe(newer)
  })

  it('skips an incoming entry that is older than the existing one', () => {
    const current = entry({ id: 'a', text: '当前', updatedAt: now - DAY })
    const stale = entry({ id: 'a', text: '旧备份', updatedAt: now - 5 * DAY })
    const result = mergeEntries([current], [stale])
    expect(result).toMatchObject({ added: 0, updated: 0, skipped: 1 })
    expect(result.merged[0]).toBe(current)
  })

  it('treats an equal updatedAt as a skip (no needless write)', () => {
    const current = entry({ id: 'a', text: '当前' })
    const same = entry({ id: 'a', text: '另一份备份' })
    expect(mergeEntries([current], [same])).toMatchObject({ updated: 0, skipped: 1 })
    expect(mergeEntries([current], [same]).merged[0]).toBe(current)
  })

  it('counts duplicate ids in one backup only once', () => {
    const e1 = entry({ id: 'a', text: '第一份', updatedAt: now - 3 * DAY })
    const e2 = entry({ id: 'a', text: '较新的一份', updatedAt: now - DAY })
    const e3 = entry({ id: 'a', text: '最旧的', updatedAt: now - 5 * DAY })
    const result = mergeEntries([], [e1, e2, e3])
    expect(result).toMatchObject({ added: 1, updated: 0, skipped: 2 })
    expect(result.merged).toEqual([e2])
  })

  it('handles an id collision with both existing and repeated incoming records', () => {
    const current = entry({ id: 'a', text: '当前', updatedAt: now - 4 * DAY })
    const newer = entry({ id: 'a', text: '较新', updatedAt: now - DAY })
    const stale = entry({ id: 'a', text: '较旧', updatedAt: now - 2 * DAY })
    const result = mergeEntries([current], [stale, newer])
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 1 })
    expect(result.merged[0]).toBe(newer)
    expect(result.added + result.updated + result.skipped).toBe(2)
  })

  it('keeps extra existing entries untouched', () => {
    const a = entry({ id: 'a' })
    const b = entry({ id: 'b' })
    const c = entry({ id: 'c' })
    const result = mergeEntries([a, b], [c])
    expect(result.merged).toHaveLength(3)
    expect(result.merged).toEqual(expect.arrayContaining([a, b, c]))
  })

  it('keeps added + updated + skipped equal to the incoming row count', () => {
    const existing = [entry({ id: 'a' }), entry({ id: 'b' })]
    const incoming = [
      entry({ id: 'c' }),
      { ...entry({ id: 'a' }), updatedAt: now + 60_000 },
      { ...entry({ id: 'b' }), updatedAt: now - 5 * DAY },
      entry({ id: 'd' }),
    ]
    const r = mergeEntries(existing, incoming)
    expect(r.added + r.updated + r.skipped).toBe(incoming.length)
    expect([...r.winners.keys()].sort()).toEqual(['a', 'c', 'd'])
  })

  it('returns a sorted copy and does not mutate inputs', () => {
    const existing = [entry({ id: 'a', createdAt: now - 3 * DAY })]
    const incoming = [entry({ id: 'b', createdAt: now - DAY })]
    const result = mergeEntries(existing, incoming)
    expect(existing).toHaveLength(1)
    expect(incoming).toHaveLength(1)
    expect(result.merged[0]?.id).toBe('b')
    result.merged.pop()
    expect(mergeEntries(existing, incoming).merged).toHaveLength(2)
  })
})

describe('importSummary', () => {
  it('adds invalid entries into the skipped count', () => {
    const parsed = { entries: [entry({ id: 'a' })], invalid: 2 }
    const merged = { merged: [], added: 2, updated: 1, skipped: 3, winners: new Map() }
    expect(importSummary(parsed, merged)).toEqual({ added: 2, updated: 1, skipped: 5 })
  })

  it('moves ignored winning ids out of added/updated into skipped', () => {
    const parsed = { entries: [], invalid: 1 }
    const merged = {
      merged: [],
      added: 2,
      updated: 1,
      skipped: 0,
      winners: new Map([
        ['new-a', false],
        ['new-b', false],
        ['old-a', true],
      ]),
    }
    expect(importSummary(parsed, merged, new Set(['new-a', 'old-a']))).toEqual({
      added: 1,
      updated: 0,
      skipped: 3,
    })
  })
})
