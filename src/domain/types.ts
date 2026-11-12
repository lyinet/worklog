/** A single piece of work, captured in one line and stored forever. */
export interface Entry {
  id: string
  /** Raw text as typed, including inline `#tags`. */
  text: string
  /** Lower-cased tags derived from `text` at write time. */
  tags: string[]
  /** Epoch milliseconds, local wall-clock moment of capture. */
  createdAt: number
  /** Epoch milliseconds, last edit. */
  updatedAt: number
  /**
   * 待删除标记的到期时间。存在时记录仍在库里、只是从列表隐藏；
   * 撤销时去掉这个字段，到点才真正 delete。见 domain/removal.ts。
   */
  deleteAfter?: number
}

/** Input for creating an entry; storage fills in id/timestamps/tags. */
export interface EntryDraft {
  text: string
  createdAt?: number
}

export type DayGroup<T> = {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string
  /** Human label, e.g. `10月8日 周三`. */
  label: string
  /** Relative label when applicable: 今天 / 昨天. */
  relative: string | null
  entries: T[]
}
