import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import {
  REMOVAL_WINDOW_MS,
  commitRemoval,
  hideRemoval,
  initialRemovalState,
  reconcileRemovals,
  tombstonesFrom,
  undoRemoval,
  unmark,
  visibleEntriesOf,
  type PendingRemoval,
} from './removal'

const T0 = new Date(2026, 4, 6, 10, 0).getTime()

function entry(id: string, text = '调通 #api 的鉴权'): Entry {
  return {
    id,
    text,
    tags: ['api'],
    createdAt: T0 - 60_000,
    updatedAt: T0 - 30_000,
  }
}

function seed(ids: string[]) {
  return initialRemovalState(ids.map((id) => entry(id)))
}

describe('hideRemoval / undoRemoval', () => {
  it('从列表消失，撤销后原样恢复（id、时间戳、标签都不变）', () => {
    const state = seed(['a', 'b'])
    const a = state.entries.find((e) => e.id === 'a') as Entry
    const hidden = hideRemoval(state, 'a', T0)
    expect(hidden.state.entries.map((e) => e.id)).toEqual(['b'])
    expect(hidden.state.pending?.entry).toBe(a) // 同一个对象，没被重新生成
    expect(hidden.effects.commitIds).toEqual([]) // 还没真删，只写了删除意图
    expect(hidden.effects.markEntries).toEqual([{ ...a, deleteAfter: T0 + REMOVAL_WINDOW_MS }])

    const undone = undoRemoval(hidden.state, T0 + 1000)
    expect(undone.state.entries.find((e) => e.id === 'a')).toEqual(a)
    expect(undone.state.entries.find((e) => e.id === 'a')).toBe(a)
    expect(undone.state.pending).toBeNull()
    expect(undone.effects.restoreEntries).toEqual([a])
    expect(undone.effects.commitIds).toEqual([])
  })

  it('二次删除会提交前一条，并把新的一条挂起', () => {
    const first = hideRemoval(seed(['a', 'b', 'c']), 'a', T0)
    const second = hideRemoval(first.state, 'b', T0 + 1000)
    expect(second.effects.commitIds).toEqual(['a'])
    expect(second.committedTombstones.map((t) => t.entry.id)).toEqual(['a'])
    expect(second.state.pending?.entry.id).toBe('b')
    expect(second.state.entries.map((e) => e.id)).toEqual(['c'])

    // 前一条已提交，撤销只能救回最后一条
    const undone = undoRemoval(second.state, T0 + 1500)
    expect(undone.state.entries.map((e) => e.id).sort()).toEqual(['b', 'c'])
  })

  it('超时后不可撤销，直接提交', () => {
    const hidden = hideRemoval(seed(['a']), 'a', T0)
    const late = undoRemoval(hidden.state, T0 + REMOVAL_WINDOW_MS)
    expect(late.state.pending).toBeNull()
    expect(late.state.entries).toEqual([])
    expect(late.effects.commitIds).toEqual(['a'])
    expect(late.effects.restoreEntries).toEqual([])
  })

  it('窗口边界：5 秒整过期，4.999 秒还能撤销', () => {
    const hidden = hideRemoval(seed(['a']), 'a', T0)
    expect(undoRemoval(hidden.state, T0 + REMOVAL_WINDOW_MS - 1).effects.restoreEntries).toHaveLength(1)
    expect(undoRemoval(hidden.state, T0 + REMOVAL_WINDOW_MS).effects.commitIds).toEqual(['a'])
  })

  it('删除不存在的 id 不清空已有待撤销项', () => {
    const hidden = hideRemoval(seed(['a']), 'a', T0)
    const miss = hideRemoval(hidden.state, 'nope', T0 + 10)
    expect(miss.state.pending?.entry.id).toBe('a')
    expect(miss.effects.commitIds).toEqual([])
  })

  it('commitRemoval 幂等：没有待撤销项时不产生副作用', () => {
    const done = commitRemoval(commitRemoval(hideRemoval(seed(['a']), 'a', T0).state).state)
    expect(done.effects.commitIds).toEqual([])
    expect(done.state.pending).toBeNull()
  })

  it('到点提交会留下补删墓碑，防止关网页时复活', () => {
    const hidden = hideRemoval(seed(['a']), 'a', T0)
    const done = commitRemoval(hidden.state)
    expect(done.effects.commitIds).toEqual(['a'])
    expect(done.committedTombstones).toHaveLength(1)
    expect(done.committedTombstones[0]?.deadline).toBe(0)
  })
})

describe('删除意图副本（关掉网页也不丢）', () => {
  it('带 deleteAfter 的条目从可见列表隐藏，但仍在库里', () => {
    const plain = entry('a')
    const marked = { ...entry('b'), deleteAfter: T0 + 3000 }
    const all = [plain, marked]
    expect(visibleEntriesOf(all).map((e) => e.id)).toEqual(['a'])
    expect(tombstonesFrom(all).map((t) => t.entry.id)).toEqual(['b'])
    expect(all).toContain(marked)
  })

  it('unmark 去掉标记，不动其它字段', () => {
    const plain = entry('a')
    expect(unmark({ ...plain, deleteAfter: T0 + 3000 })).toEqual(plain)
    expect(unmark({ ...plain, deleteAfter: 0 })).not.toHaveProperty('deleteAfter')
  })
})

describe('reconcileRemovals（关掉网页后重开）', () => {
  it('未过期的墓碑继续可撤销，记录从库里原样读回', () => {
    const a = entry('a')
    const b = entry('b')
    const marked = { ...a, deleteAfter: T0 + 4000 }
    const tombstones: PendingRemoval[] = tombstonesFrom([marked, b])
    const r = reconcileRemovals([marked, b], tombstones, T0)
    expect(r.state.pending?.entry.id).toBe('a')
    expect(r.state.entries.map((e) => e.id)).toEqual(['b'])
    expect(r.effects.commitIds).toEqual([])
    // 撤销恢复的是去掉标记的原始条目
    const undone = undoRemoval(r.state, T0 + 1)
    expect(undone.effects.restoreEntries[0]).toEqual(a)
  })

  it('过期墓碑直接提交，不把已确认的删除回滚', () => {
    const marked = { ...entry('a'), deleteAfter: T0 - 1 }
    const tombstones = tombstonesFrom([marked])
    const r = reconcileRemovals([marked], tombstones, T0)
    expect(r.state.entries).toEqual([])
    expect(r.state.pending).toBeNull()
    expect(r.effects.commitIds).toEqual(['a'])
  })

  it('多条墓碑：只保留最后一条可撤销，其余提交', () => {
    const a = { ...entry('a'), deleteAfter: T0 + 1000 }
    const b = { ...entry('b'), deleteAfter: T0 + 4000 }
    const tombstones = tombstonesFrom([a, b])
    const r = reconcileRemovals([a, b], tombstones, T0)
    expect(r.effects.commitIds).toEqual(['a'])
    expect(r.state.pending?.entry.id).toBe('b')
    expect(r.committedTombstones.map((t) => t.entry.id)).toEqual(['a'])
  })

  it('库里已被别的会话删掉的条目：不凭空复活，墓碑从传入列表读', () => {
    const a = entry('a')
    const r = reconcileRemovals([], [{ entry: a, deadline: T0 + 4000 }], T0)
    expect(r.state.entries).toEqual([])
    expect(r.state.pending?.entry).toEqual(a)
  })
})
