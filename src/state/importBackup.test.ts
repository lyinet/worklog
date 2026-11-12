import { describe, expect, it } from 'vitest'
import type { Entry } from '../domain/types'
import { MemoryStore } from '../storage/types'
import { applyBackup } from './importBackup'

const at = Date.now() - 120_000

function makeEntry(id: string, text: string, updatedAt = at): Entry {
  return { id, text, tags: [], createdAt: updatedAt - 60_000, updatedAt }
}

function backup(entries: unknown[]): string {
  return JSON.stringify({ version: 1, entries })
}

async function run(store: MemoryStore, text: string, pendingId: string | null = null) {
  return applyBackup(store, text, pendingId)
}

describe('applyBackup', () => {
  it('writes new entries to the store and reports the counts', async () => {
    const store = new MemoryStore()
    const incoming = [makeEntry('b', '新记录')]
    const summary = await run(store, backup(incoming))
    expect(summary).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(await store.all()).toEqual(incoming)
  })

  it('merges rather than replacing, keeping the newer version of an id', async () => {
    const store = new MemoryStore()
    const old = makeEntry('a', '旧', at - 60_000)
    const untouched = makeEntry('z', '本机原有')
    await store.put(old)
    await store.put(untouched)

    const newer = { ...old, text: '备份里较新', updatedAt: at }
    const summary = await run(store, backup([newer]))

    expect(summary).toEqual({ added: 0, updated: 1, skipped: 0 })
    const all = await store.all()
    expect(all).toHaveLength(2)
    expect(all).toEqual(expect.arrayContaining([newer, untouched]))
  })

  it('skips bad entries, older duplicates and rows that lose an id conflict', async () => {
    const store = new MemoryStore()
    const current = makeEntry('a', '当前', at)
    await store.put(current)
    const stale = { ...current, text: '旧备份', updatedAt: at - 60_000 }

    const summary = await run(
      store,
      JSON.stringify({ version: 1, entries: [null, stale, { id: 'bad', text: 3 }] }),
    )

    expect(summary).toEqual({ added: 0, updated: 0, skipped: 3 })
    expect(await store.all()).toEqual([current])
  })

  it('throws a readable error for a malformed backup and writes nothing', async () => {
    const store = new MemoryStore()
    const existing = makeEntry('a', '原有')
    await store.put(existing)

    await expect(run(store, '{"version":2,"entries":[]}')).rejects.toThrow(/version 必须是 1/)
    expect(await store.all()).toEqual([existing])
  })

  it('does not resurrect a pending deletion or overwrite a tombstone', async () => {
    const store = new MemoryStore()
    const doomed = makeEntry('a', '刚删掉', at - 60_000)
    const tombstone = { ...doomed, deleteAfter: Date.now() + 5000 }
    const alsoDoomed = makeEntry('b', '也在撤销窗口', at - 60_000)
    await store.put(tombstone)
    await store.put({ ...alsoDoomed, deleteAfter: Date.now() + 5000 })

    const newerA = { ...doomed, text: '备份里的同 id', updatedAt: at }
    const newerB = { ...alsoDoomed, text: '备份里的 B', updatedAt: at }
    const summary = await run(store, backup([newerA, newerB]), 'b')

    expect(summary).toEqual({ added: 0, updated: 0, skipped: 2 })
    expect((await store.all()).find((e) => e.id === 'a')?.text).toBe('刚删掉')
    expect((await store.all()).find((e) => e.id === 'b')?.text).toBe('也在撤销窗口')
  })

  it('does not strip an existing deleteAfter marker that the backup also contains', async () => {
    const store = new MemoryStore()
    const tombstone = { ...makeEntry('a', '待删除'), deleteAfter: Date.now() + 5000 }
    await store.put(tombstone)
    // parseBackup 会丢掉备份里的 deleteAfter，但库里已有的墓碑不受影响。
    const summary = await run(store, backup([{ ...tombstone }]))
    expect(summary).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect((await store.all())[0]?.deleteAfter).toBe(tombstone.deleteAfter)
  })

  it('an empty backup is a no-op', async () => {
    const store = new MemoryStore()
    const existing = makeEntry('a', '原有')
    await store.put(existing)
    const summary = await run(store, backup([]))
    expect(summary).toEqual({ added: 0, updated: 0, skipped: 0 })
    expect(await store.all()).toEqual([existing])
  })
})
