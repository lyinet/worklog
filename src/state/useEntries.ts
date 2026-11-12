import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Entry } from '../domain/types'
import { createEntry, editEntry, sortNewestFirst } from '../domain/entries'
import type { ImportSummary } from '../domain/import'
import {
  commitRemoval,
  hideRemoval,
  isExpired,
  reconcileRemovals,
  tombstonesFrom,
  undoRemoval,
  type PendingRemoval,
  type RemovalState,
} from '../domain/removal'
import type { EntryStore } from '../storage/types'
import { applyBackup } from './importBackup'
import { applyTransition, RemovalWriter } from './removalEffects'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface UseEntries {
  entries: Entry[]
  status: LoadStatus
  error: string | null
  add: (text: string) => Promise<Entry | null>
  update: (id: string, text: string) => Promise<void>
  /** 删除：先隐藏 + 写墓碑，5 秒内可撤销，不立刻落库删除。 */
  remove: (id: string) => Promise<void>
  /** 撤销上一条待删除记录，原样恢复。 */
  undoRemove: () => Promise<void>
  /** 当前可撤销的窗口，null 表示没有。 */
  pendingRemoval: PendingRemoval | null
  clearAll: () => Promise<void>
  /**
   * 从 JSON 备份合并记录（不覆盖、不清空）。解析/结构错误直接抛出，
   * 由调用方显示给用户；落库失败时抛错且不改界面状态。
   */
  importBackup: (text: string) => Promise<ImportSummary>
  reload: () => Promise<void>
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function useEntries(store: EntryStore): UseEntries {
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)

  // 状态机镜像在 ref 里：纯函数要读「当前状态」，但不能让每次渲染都重建回调。
  const state = useRef<RemovalState>({ entries: [], pending: null })
  const writer = useMemo(() => new RemovalWriter(), [])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function publish(next: RemovalState) {
    state.current = next
    if (!mounted.current) return
    setEntries(next.entries)
    setPendingRemoval(next.pending)
  }

  function fail(cause: unknown) {
    if (mounted.current) setError(messageOf(cause))
  }

  /** 重新扫库：补提交过期墓碑、恢复没过期的撤销窗口。 */
  const reload = useCallback(async () => {
    try {
      const next = await writer.run(async () => {
        const all = await store.all()
        const transition = reconcileRemovals(all, tombstonesFrom(all), Date.now())
        await applyTransition(store, transition)
        // reconcile 的 entries 已经去掉了所有墓碑；补删只发生在墓碑上，
        // 可见列表不会因此多出或少了谁。
        return transition.state
      })
      publish(next)
      if (mounted.current) {
        setStatus('ready')
        setError(null)
      }
    } catch (cause) {
      fail(cause)
      if (mounted.current) setStatus('error')
    }
  }, [store, writer])

  useEffect(() => {
    void reload()
  }, [reload])

  /** 倒计时到点：把当前窗口真正从 IndexedDB 删掉。 */
  const commitExpired = useCallback(
    async (expectedId: string) => {
      try {
        await writer.run(async () => {
          const current = state.current
          if (!current.pending || current.pending.entry.id !== expectedId) return
          if (!isExpired(current.pending, Date.now())) return
          const transition = commitRemoval(current)
          await applyTransition(store, transition)
          publish(transition.state)
        })
      } catch (cause) {
        // 删除失败时窗口保留，用户还能再点撤销；错误会显示出来。
        fail(cause)
      }
    },
    [store, writer],
  )

  // 每个窗口配一个定时器；窗口变化或卸载时立刻作废，避免旧定时器误提交新窗口。
  useEffect(() => {
    if (!pendingRemoval) return
    let active = true
    const delay = Math.max(0, pendingRemoval.deadline - Date.now())
    const timer = window.setTimeout(() => {
      if (active) void commitExpired(pendingRemoval.entry.id)
    }, delay)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [pendingRemoval, commitExpired])

  const add = useCallback(
    async (text: string): Promise<Entry | null> => {
      if (!text.trim()) return null
      const entry = createEntry({ text })
      // Optimistic: the entry is on screen before the disk write resolves.
      const optimistic = sortNewestFirst([entry, ...state.current.entries])
      state.current = { ...state.current, entries: optimistic }
      setEntries(optimistic)
      try {
        await writer.run(() => store.put(entry))
        return entry
      } catch (cause) {
        const rolledBack = optimistic.filter((e) => e.id !== entry.id)
        state.current = { ...state.current, entries: rolledBack }
        setEntries(rolledBack)
        fail(cause)
        return null
      }
    },
    [store, writer],
  )

  const update = useCallback(
    async (id: string, text: string) => {
      const current = state.current.entries.find((e) => e.id === id)
      if (!current) return
      const next = editEntry(current, text)
      const list = sortNewestFirst(state.current.entries.map((e) => (e.id === id ? next : e)))
      state.current = { ...state.current, entries: list }
      setEntries(list)
      try {
        await writer.run(() => store.put(next))
      } catch (cause) {
        fail(cause)
        await reload()
      }
    },
    [store, writer, reload],
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await writer.run(async () => {
          const transition = hideRemoval(state.current, id, Date.now())
          // 二次删除：上一条在这里真正落库删除；新的一条写墓碑。
          await applyTransition(store, transition)
          publish(transition.state)
        })
      } catch (cause) {
        fail(cause)
        await reload()
      }
    },
    [store, writer, reload],
  )

  const undoRemove = useCallback(async () => {
    try {
      await writer.run(async () => {
        const transition = undoRemoval(state.current, Date.now())
        await applyTransition(store, transition)
        publish(transition.state)
      })
    } catch (cause) {
      fail(cause)
    }
  }, [store, writer])

  const clearAll = useCallback(async () => {
    const snapshot = entries
    state.current = { entries: [], pending: null }
    setPendingRemoval(null)
    setEntries([])
    try {
      await writer.run(() => store.clear())
    } catch (cause) {
      setEntries(snapshot)
      fail(cause)
    }
  }, [store, writer, entries])

  const importBackup = useCallback(
    async (text: string): Promise<ImportSummary> => {
      const summary = await writer.run(() =>
        applyBackup(store, text, state.current.pending?.entry.id ?? null),
      )
      // 从库里重读，顺带补提交过期墓碑；界面和磁盘保持一致。
      await reload()
      return summary
    },
    [store, writer, reload],
  )

  return useMemo(
    () => ({
      entries,
      status,
      error,
      add,
      update,
      remove,
      undoRemove,
      pendingRemoval,
      clearAll,
      importBackup,
      reload,
    }),
    [
      entries,
      status,
      error,
      add,
      update,
      remove,
      undoRemove,
      pendingRemoval,
      clearAll,
      importBackup,
      reload,
    ],
  )
}
