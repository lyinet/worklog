import { sortNewestFirst } from './entries'
import type { Entry } from './types'

/** 删除后还能撤销的窗口长度。 */
export const REMOVAL_WINDOW_MS = 5000

export interface PendingRemoval {
  /** 原样保留整条记录：撤销时 id、时间戳、标签都不重新生成。 */
  entry: Entry & { deleteAfter?: number }
  /** 窗口截止的绝对时间（epoch ms）。 */
  deadline: number
}

export interface RemovalState {
  /** 当前可见条目，待删除的那条已经从里面摘掉。 */
  entries: Entry[]
  pending: PendingRemoval | null
}

/** 需要对持久层执行的操作。纯逻辑只产出指令，由 useEntries 落地。 */
export interface RemovalEffects {
  /** 真正从 IndexedDB 删掉的 id。 */
  commitIds: string[]
  /** 撤销时写回（put）的原始条目。 */
  restoreEntries: Entry[]
  /** 窗口期内写进库里的「删除意图」副本，关掉网页也不丢。 */
  markEntries: Entry[]
}

export interface RemovalTransition {
  state: RemovalState
  effects: RemovalEffects
  /** 已确认删除、但 store.delete 尚未落盘的写前日志，重开时补删。 */
  committedTombstones: PendingRemoval[]
}

function noEffects(): RemovalEffects {
  return { commitIds: [], restoreEntries: [], markEntries: [] }
}

/** 已确认删除的墓碑，deadline 放到过去，重开时一律补删。 */
function expired(p: PendingRemoval): PendingRemoval {
  return { entry: p.entry, deadline: 0 }
}

export function initialRemovalState(entries: readonly Entry[]): RemovalState {
  return { entries: sortNewestFirst(entries), pending: null }
}

/**
 * 从库里读回墓碑。删除意图直接写在条目副本的 `deleteAfter` 字段上，
 * 和记录本身共用一个 IndexedDB store，不另开 localStorage：
 * 关掉网页时数据和删除意图一起落盘，不会只剩一半。
 */
export function tombstonesFrom(all: readonly Entry[]): PendingRemoval[] {
  return all
    .filter((e): e is Entry & { deleteAfter: number } => e.deleteAfter !== undefined)
    .map((e) => ({ entry: e, deadline: e.deleteAfter }))
    .sort((a, b) => a.deadline - b.deadline)
}

/** 可见列表：库里全部记录，去掉所有带删除标记的副本。 */
export function visibleEntriesOf(all: readonly Entry[]): Entry[] {
  return sortNewestFirst(all.filter((e) => e.deleteAfter === undefined))
}

/** 库里的条目还带着删除标记 → 去掉标记，恢复成普通记录。 */
export function unmark(entry: Entry): Entry {
  if (entry.deleteAfter === undefined) return entry // 普通条目保持原对象引用
  const { deleteAfter: _ignored, ...plain } = entry
  return plain
}

export function remainingMs(pending: PendingRemoval, now: number): number {
  return Math.max(0, pending.deadline - now)
}

export function isExpired(pending: PendingRemoval, now: number): boolean {
  return now >= pending.deadline
}

/**
 * 条目从列表消失，开始 5 秒窗口。若上一条还在窗口里，先把它提交掉
 * （「再删下一条时才真正删除」）。此时不删 IndexedDB：只在同一事务里
 * 覆写一条带 `deleteAfter` 的副本，库里仍有完整数据。
 */
export function hideRemoval(state: RemovalState, id: string, now: number): RemovalTransition {
  const effects = noEffects()
  const entry = state.entries.find((e) => e.id === id)
  // id 不在列表里（重复点击 / 已消失）：整次调用作废，别把上一条的撤销机会吞掉。
  if (!entry) return { state, effects, committedTombstones: [] }
  const committedTombstones: PendingRemoval[] = []
  if (state.pending) {
    effects.commitIds.push(state.pending.entry.id)
    committedTombstones.push(expired(state.pending))
  }
  const pending: PendingRemoval = { entry, deadline: now + REMOVAL_WINDOW_MS }
  effects.markEntries.push({ ...entry, deleteAfter: pending.deadline })
  return {
    state: { entries: state.entries.filter((e) => e.id !== id), pending },
    effects,
    committedTombstones,
  }
}

/** 点「撤销」：把原始对象放回列表并写回库里。窗口已过则不再允许撤销。 */
export function undoRemoval(state: RemovalState, now: number): RemovalTransition {
  const p = state.pending
  if (!p) return { state, effects: noEffects(), committedTombstones: [] }
  if (isExpired(p, now)) {
    return {
      state: { ...state, pending: null },
      effects: { ...noEffects(), commitIds: [p.entry.id] },
      committedTombstones: [expired(p)],
    }
  }
  return {
    state: { entries: sortNewestFirst([...state.entries, unmark(p.entry)]), pending: null },
    effects: { ...noEffects(), restoreEntries: [unmark(p.entry)] },
    committedTombstones: [],
  }
}

/** 倒计时到点：真正落库删除。 */
export function commitRemoval(state: RemovalState): RemovalTransition {
  const p = state.pending
  if (!p) return { state, effects: noEffects(), committedTombstones: [] }
  return {
    state: { ...state, pending: null },
    effects: { ...noEffects(), commitIds: [p.entry.id] },
    committedTombstones: [expired(p)],
  }
}

/**
 * 重开页面时读回上一会话留下的墓碑。过期的直接提交；未过期的只保留
 * 最后一条继续可撤销，其余一并提交。这样关掉网页既不会丢记录，
 * 也不会把用户已经确认过的删除偷偷回滚。
 */
export function reconcileRemovals(
  all: readonly Entry[],
  tombstones: readonly PendingRemoval[],
  now: number,
): RemovalTransition {
  const effects = noEffects()
  const alive = tombstones
    .filter((t) => {
      if (isExpired(t, now)) {
        effects.commitIds.push(t.entry.id)
        return false
      }
      return true
    })
    .sort((a, b) => a.deadline - b.deadline)

  for (const t of alive.slice(0, -1)) effects.commitIds.push(t.entry.id)
  const pending = alive.at(-1) ?? null
  const hidden = new Set(tombstones.map((t) => t.entry.id))
  return {
    state: { entries: visibleEntriesOf(all), pending },
    effects,
    committedTombstones: tombstones.filter((t) => hidden.has(t.entry.id) && t !== pending)
      .map(expired),
  }
}
