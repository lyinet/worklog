import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Entry } from '../domain/types'
import { createEntry, editEntry, sortNewestFirst } from '../domain/entries'
import type { EntryStore } from '../storage/types'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface UseEntries {
  entries: Entry[]
  status: LoadStatus
  error: string | null
  add: (text: string) => Promise<Entry | null>
  update: (id: string, text: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  reload: () => Promise<void>
}

export function useEntries(store: EntryStore): UseEntries {
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const all = await store.all()
      setEntries(sortNewestFirst(all))
      setStatus('ready')
      setError(null)
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [store])

  useEffect(() => {
    void reload()
  }, [reload])

  const add = useCallback(
    async (text: string): Promise<Entry | null> => {
      if (!text.trim()) return null
      const entry = createEntry({ text })
      // Optimistic: the entry is on screen before the disk write resolves.
      setEntries((prev) => sortNewestFirst([entry, ...prev]))
      try {
        await store.put(entry)
        return entry
      } catch (cause) {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id))
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }
    },
    [store],
  )

  const update = useCallback(
    async (id: string, text: string) => {
      let next: Entry | null = null
      setEntries((prev) => {
        const current = prev.find((e) => e.id === id)
        if (!current) return prev
        next = editEntry(current, text)
        return sortNewestFirst(prev.map((e) => (e.id === id ? (next as Entry) : e)))
      })
      if (!next) return
      try {
        await store.put(next)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        await reload()
      }
    },
    [store, reload],
  )

  const remove = useCallback(
    async (id: string) => {
      const snapshot = entries
      setEntries((prev) => prev.filter((e) => e.id !== id))
      try {
        await store.delete(id)
      } catch (cause) {
        setEntries(snapshot)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [store, entries],
  )

  const clearAll = useCallback(async () => {
    const snapshot = entries
    setEntries([])
    try {
      await store.clear()
    } catch (cause) {
      setEntries(snapshot)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [store, entries])

  return useMemo(
    () => ({ entries, status, error, add, update, remove, clearAll, reload }),
    [entries, status, error, add, update, remove, clearAll, reload],
  )
}
