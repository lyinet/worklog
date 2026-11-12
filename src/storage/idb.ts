import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Entry } from '../domain/types'
import type { EntryStore } from './types'

interface WorklogDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: { createdAt: number }
  }
}

const DB_NAME = 'worklog'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<WorklogDB>> | null = null

function db() {
  dbPromise ??= openDB<WorklogDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('entries')) {
        const store = database.createObjectStore('entries', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    },
  })
  return dbPromise
}

export class IndexedDBStore implements EntryStore {
  async all(): Promise<Entry[]> {
    return (await db()).getAll('entries')
  }

  async put(entry: Entry): Promise<void> {
    await (await db()).put('entries', entry)
  }

  async delete(id: string): Promise<void> {
    await (await db()).delete('entries', id)
  }

  async clear(): Promise<void> {
    await (await db()).clear('entries')
  }
}

export function createStore(): EntryStore {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB unavailable; pass a store explicitly')
  }
  return new IndexedDBStore()
}
