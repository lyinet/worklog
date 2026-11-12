import type { PendingRemoval, RemovalEffects, RemovalTransition } from '../domain/removal'
import { unmark } from '../domain/removal'
import type { EntryStore } from '../storage/types'

/**
 * 把 domain 产出的「指令」落到 IndexedDB。domain 只算状态，不碰 IO。
 *
 * 关掉网页也不丢数据的方案（只用现有 EntryStore，不引第二个存储）：
 *
 * 1. 删除时不 delete，而是把原记录带上 `deleteAfter = deadline` 写回同一个
 *    store。原文 + 「删除意图 + 到期时间」一起落盘，关掉网页再打开，
 *    reconcileRemovals 读回墓碑，没过期的继续撤销、过期的补删。
 * 2. 真正删除前，先把「已确认删除」的墓碑改写成过期标记（deleteAfter=0）
 *    写回库里，作为写前日志。这样二次删除 / 超时后即使 store.delete 没执行完
 *    就崩溃，重开时过期墓碑也会被补删，不会把用户确认过的删除偷偷回滚。
 * 3. 全程只有 entry 记录，没有 localStorage / 第二个 object store，也就没有
 *    「两个存储各写了一半」的不一致窗口。IndexDB 的单条 put/delete 是原子的。
 */
export async function applyRemovalEffects(
  store: EntryStore,
  effects: RemovalEffects,
  confirmed: readonly PendingRemoval[] = [],
): Promise<void> {
  // 写前日志：先把已确认删除的条目标成过期，delete 崩溃时重开会补删。
  for (const t of confirmed) {
    await store.put({ ...unmark(t.entry), deleteAfter: t.deadline })
  }
  // 新的待删除窗口（带未来到期时间的墓碑）。
  for (const entry of effects.markEntries) await store.put(entry)
  // 撤销：写回不带标记的原文。
  for (const entry of effects.restoreEntries) await store.put(unmark(entry))
  // 最后真正删除。顺序保证：这几步任何一步崩溃，库里的墓碑都能让重开自愈。
  for (const id of effects.commitIds) await store.delete(id)
}

/** 一次过渡的完整落地：状态 + 副作用 + 写前日志。 */
export async function applyTransition(
  store: EntryStore,
  transition: RemovalTransition,
): Promise<void> {
  await applyRemovalEffects(store, transition.effects, transition.committedTombstones)
}

/**
 * 所有写库操作串行排队：倒计时到期、点撤销、二次删除同时到达时
 * 不会出现「先恢复再删除」的半状态。
 */
export class RemovalWriter {
  private queue: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    // 单个任务失败不该把后续操作全部卡死。
    this.queue = result.catch(() => undefined)
    return result
  }
}
