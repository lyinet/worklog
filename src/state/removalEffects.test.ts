import { describe, expect, it } from 'vitest'
import type { Entry } from '../domain/types'
import {
  REMOVAL_WINDOW_MS,
  commitRemoval,
  hideRemoval,
  reconcileRemovals,
  tombstonesFrom,
  undoRemoval,
  visibleEntriesOf,
  type RemovalState,
  type RemovalTransition,
} from '../domain/removal'
import { MemoryStore } from '../storage/types'
import { applyTransition, RemovalWriter } from './removalEffects'

const T0 = 1_000_000

function entry(id: string, at = T0 - 60_000): Entry {
  return {
    id,
    text: `第 ${id} 条 #标签`,
    tags: ['标签'],
    createdAt: at,
    updatedAt: at + 1,
  }
}

async function seed(...entries: Entry[]): Promise<MemoryStore> {
  const store = new MemoryStore()
  for (const e of entries) await store.put(e)
  return store
}

/** 走一遍真实的「hook 会做的事」：纯函数 → 落库 → 发布状态。 */
async function run(
  store: MemoryStore,
  transition: RemovalTransition,
): Promise<RemovalState> {
  await applyTransition(store, transition)
  return transition.state
}

/** 模拟关掉网页重开：只靠库里的内容恢复。 */
async function reboot(store: MemoryStore, now: number): Promise<RemovalState> {
  const all = await store.all()
  const transition = reconcileRemovals(all, tombstonesFrom(all), now)
  await applyTransition(store, transition)
  const fresh = await store.all()
  return {
    ...transition.state,
    entries: transition.state.entries.filter((e) => fresh.some((s) => s.id === e.id)),
  }
}

describe('删除落库（MemoryStore）', () => {
  it('删除后条目从列表消失，但原文仍在库里；撤销完整恢复', async () => {
    const a = entry('a', 1000)
    const b = entry('b', 2000)
    const store = await seed(a, b)
    let state: RemovalState = { entries: [b, a], pending: null }

    state = await run(store, hideRemoval(state, 'a', T0))
    expect(state.entries.map((e) => e.id)).toEqual(['b'])
    expect(visibleEntriesOf(await store.all())).toEqual([b])
    // 库里带删除标记的副本，原文没动
    expect(await store.all()).toContainEqual({ ...a, deleteAfter: T0 + REMOVAL_WINDOW_MS })

    state = await run(store, undoRemoval(state, T0 + 1))
    expect(state.pending).toBeNull()
    expect(state.entries.find((e) => e.id === 'a')).toEqual(a)
    expect(await store.all()).toEqual([a, b])
  })

  it('二次删除会提交前一条，新的窗口只针对后一条', async () => {
    const a = entry('a', 1000)
    const b = entry('b', 2000)
    const store = await seed(a, b)
    let state: RemovalState = { entries: [b, a], pending: null }

    state = await run(store, hideRemoval(state, 'a', T0))
    state = await run(store, hideRemoval(state, 'b', T0 + 10))
    expect((await store.all()).find((e) => e.id === 'a')).toBeUndefined()
    expect((await store.all()).find((e) => e.id === 'b')).toEqual({
      ...b,
      deleteAfter: T0 + 10 + REMOVAL_WINDOW_MS,
    })

    state = await run(store, undoRemoval(state, T0 + 20))
    expect(state.entries.map((e) => e.id)).toEqual(['b'])
  })

  it('超时后不可撤销，数据真正删掉', async () => {
    const a = entry('a')
    const store = await seed(a)
    let state: RemovalState = { entries: [a], pending: null }
    state = await run(store, hideRemoval(state, 'a', T0))
    state = await run(store, commitRemoval(state))
    expect(await store.all()).toEqual([])

    state = await run(store, undoRemoval(state, T0 + REMOVAL_WINDOW_MS))
    expect(state.entries).toEqual([])
    expect(state.pending).toBeNull()
  })

  it('关掉网页再打开：没过期的窗口仍然可撤销', async () => {
    const a = entry('a', 1000)
    const b = entry('b', 2000)
    const store = await seed(a, b)
    const state: RemovalState = { entries: [b, a], pending: null }
    await run(store, hideRemoval(state, 'a', T0))

    const rebooted = await reboot(store, T0 + 1000)
    expect(rebooted.pending?.entry.id).toBe('a')
    expect(rebooted.entries.map((e) => e.id)).toEqual(['b'])

    const undone = await run(store, undoRemoval(rebooted, T0 + 1100))
    expect(undone.entries.find((e) => e.id === 'a')).toEqual(a)
    expect(await store.all()).toEqual([a, b])
  })

  it('关掉网页再打开：过期的自动补提交，不能撤销', async () => {
    const a = entry('a', 1000)
    const b = entry('b', 2000)
    const store = await seed(a, b)
    const state: RemovalState = { entries: [b, a], pending: null }
    await run(store, hideRemoval(state, 'a', T0))

    const rebooted = await reboot(store, T0 + REMOVAL_WINDOW_MS + 1)
    expect(rebooted.pending).toBeNull()
    expect(rebooted.entries.map((e) => e.id)).toEqual(['b'])
    expect(await store.all()).toEqual([b])
  })

  it('写前日志：确认删除后、落盘前被杀，重开不把已删的回滚', async () => {
    const a = entry('a')
    const store = await seed(a)
    const state: RemovalState = { entries: [a], pending: null }
    const hidden = hideRemoval(state, 'a', T0)
    await applyTransition(store, hidden)

    // 模拟崩溃：commitRemoval 已算出「确认删除」，store.delete 还没执行完。
    // 用只含写前日志、不含 commitIds 的过渡来落地。
    const committed = commitRemoval(hidden.state)
    await applyTransition(store, {
      ...committed,
      effects: { ...committed.effects, commitIds: [] },
    })
    // 此刻原文还在库里，但墓碑已经变成过期的（deadline=0）。
    expect((await store.all()).find((e) => e.id === 'a')).toMatchObject({ deleteAfter: 0 })

    const rebooted = await reboot(store, T0 + REMOVAL_WINDOW_MS + 1)
    expect(rebooted.pending).toBeNull()
    expect(rebooted.entries).toEqual([])
    expect(await store.all()).toEqual([])
  })

  it('写库串行：撤销和倒计时同时到达不会变成半状态', async () => {
    const a = entry('a')
    const store = await seed(a)
    const writer = new RemovalWriter()
    let state: RemovalState = { entries: [a], pending: null }
    state = hideRemoval(state, 'a', T0).state

    await Promise.all([
      writer.run(async () => {
        const t = undoRemoval(state, T0 + 1)
        await applyTransition(store, t)
        state = t.state
      }),
      writer.run(async () => {
        const t = commitRemoval(state)
        await applyTransition(store, t)
        state = t.state
      }),
    ])
    // 无论谁先，库里都不该既有原文又留着删除标记
    const all = await store.all()
    expect(all.filter((e) => e.id === 'a')).toHaveLength(1)
    expect(all.find((e) => e.id === 'a')).not.toHaveProperty('deleteAfter')
  })
})
