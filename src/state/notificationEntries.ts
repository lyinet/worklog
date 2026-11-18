import { createEntry } from '../domain/entries'
import type { Entry } from '../domain/types'
import type { PendingCapture } from '../plugins/captureNotification'
import type { EntryStore } from '../storage/types'

export type NotificationEntrySource = Pick<PendingCapture, 'id' | 'createdAt'>

export function isPendingCapture(value: unknown): value is PendingCapture {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<PendingCapture>
  return typeof entry.id === 'string'
    && /^notification-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.id)
    && typeof entry.text === 'string'
    && typeof entry.createdAt === 'number' && Number.isSafeInteger(entry.createdAt)
    && entry.createdAt > 0 && entry.createdAt <= 8_640_000_000_000_000
}

export async function saveNotificationEntry(
  store: EntryStore,
  text: string,
  source: NotificationEntrySource,
): Promise<Entry | null> {
  if (!isPendingCapture({ ...source, text })) throw new Error('通知记录格式错误')
  if (!text.trim()) return null
  const existing = (await store.all()).find((entry) => entry.id === source.id)
  if (existing) return existing
  const entry = { ...createEntry({ text, createdAt: source.createdAt }), id: source.id }
  await store.put(entry)
  return entry
}

export interface CaptureImportSummary {
  added: number
  dropped: number
}

interface CaptureQueue {
  drain: () => Promise<{ entries: PendingCapture[]; dropped: number }>
  acknowledge: (ids: string[]) => Promise<void>
  release: () => Promise<void>
}

export async function importNotificationEntries(
  queue: CaptureQueue,
  add: (text: string, source: NotificationEntrySource) => Promise<Entry | null>,
  isActive: () => boolean = () => true,
): Promise<CaptureImportSummary> {
  let added = 0
  let dropped = 0
  while (true) {
    if (!isActive()) return { added, dropped }
    const batch = await queue.drain()
    dropped += batch.dropped
    if (batch.entries.length === 0) return { added, dropped }
    try {
      for (const entry of batch.entries) {
        if (!isActive()) return { added, dropped }
        if (!isPendingCapture(entry)) throw new Error('通知记录格式错误，已保留原记录')
        if (entry.text.trim()) {
          const saved = await add(entry.text, { id: entry.id, createdAt: entry.createdAt })
          if (!saved) throw new Error('通知记录入库失败，原记录已保留，下次打开重试')
          added++
        }
        await queue.acknowledge([entry.id])
      }
    } finally {
      await queue.release()
    }
  }
}
