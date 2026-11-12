import type { Entry } from '../domain/types'

export interface EntryStore {
  all(): Promise<Entry[]>
  put(entry: Entry): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

/** In-memory store for tests and for environments without IndexedDB. */
export class MemoryStore implements EntryStore {
  private readonly map = new Map<string, Entry>()

  async all(): Promise<Entry[]> {
    return [...this.map.values()]
  }

  async put(entry: Entry): Promise<void> {
    this.map.set(entry.id, entry)
  }

  async delete(id: string): Promise<void> {
    this.map.delete(id)
  }

  async clear(): Promise<void> {
    this.map.clear()
  }
}
