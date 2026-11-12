import { parseTags } from './tags'
import type { Entry, EntryDraft } from './types'

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Build a storable entry from a raw draft. Tags are always derived, never passed in. */
export function createEntry(draft: EntryDraft, now = Date.now()): Entry {
  const text = draft.text.trim()
  return {
    id: newId(),
    text,
    tags: parseTags(text),
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
  }
}

export function editEntry(entry: Entry, text: string, now = Date.now()): Entry {
  const next = text.trim()
  return { ...entry, text: next, tags: parseTags(next), updatedAt: now }
}

export function sortNewestFirst(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt)
}
