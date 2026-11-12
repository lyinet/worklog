import { sortNewestFirst } from './entries'
import type { Entry } from './types'

/**
 * JSON 备份恢复。全是纯函数：不碰 DOM、不碰存储，外部 JSON 一律先当 unknown
 * 再逐字段收窄，绝不把解析结果直接当成 Entry 用。
 */

export interface ParsedBackup {
  /** 校验通过的条目，只保留 Entry 的五个字段。 */
  entries: Entry[]
  /** 字段不合法、被跳过的条目数。 */
  invalid: number
}

export interface MergeResult {
  /** 合并后的完整列表，按 createdAt 从新到旧。 */
  merged: Entry[]
  /** 新增的 id 数。 */
  added: number
  /** 被备份里较新的版本替换掉的 id 数。 */
  updated: number
  /** 没能应用的备份条目数：同 id 不比现有新，或备份内部重复时落败的那些。 */
  skipped: number
  /** 备份中胜出的 id → true 表示原本就存在（updated），false 表示新增。 */
  winners: ReadonlyMap<string, boolean>
}

/** 给 UI 看的一句话结果，skipped 含坏条目、没赢过现有记录的条目、被排除的 id。 */
export interface ImportSummary {
  added: number
  updated: number
  skipped: number
}

/** 2000-01-01T00:00:00Z。更早的 epoch ms 多半是秒级时间戳或脏数据。 */
const MIN_TIMESTAMP = 946684800000
/** 换机 / 时钟不准时，容忍备份里有一天以内的未来时间。 */
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function brief(value: unknown): string {
  if (value === undefined) return '缺少'
  if (value === null) return 'null'
  if (Array.isArray(value)) return '数组'
  if (typeof value === 'object') return '对象'
  return JSON.stringify(value) ?? String(value)
}

function isTimestamp(value: unknown, now: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_TIMESTAMP &&
    value <= now + CLOCK_SKEW_MS
  )
}

function toEntry(raw: unknown, now: number): Entry | null {
  if (!isObject(raw)) return null
  const { id, text, tags, createdAt, updatedAt } = raw
  if (typeof id !== 'string' || id.trim() === '') return null
  if (typeof text !== 'string') return null
  if (!Array.isArray(tags)) return null
  const tagList: string[] = []
  for (const tag of tags) {
    if (typeof tag !== 'string') return null
    tagList.push(tag)
  }
  if (!isTimestamp(createdAt, now) || !isTimestamp(updatedAt, now)) return null
  if (updatedAt < createdAt) return null
  // 只留五个字段：备份里可能带着 deleteAfter 之类的额外字段，恢复时不能把
  // 「待删除」标记一起带回来。
  return { id, text, tags: tagList, createdAt, updatedAt }
}

/** 解析并校验 `{ version: 1, entries: [...] }`；坏条目跳过，整体结构不对则抛错。 */
export function parseBackup(json: string, now = Date.now()): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(json) as unknown
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`JSON 解析失败：${detail}`)
  }
  if (!isObject(data)) throw new Error('备份格式不对：顶层应该是一个对象')
  if (data.version !== 1) {
    throw new Error(`备份格式不对：version 必须是 1（文件里是 ${brief(data.version)}）`)
  }
  if (!Array.isArray(data.entries)) {
    throw new Error(`备份格式不对：entries 应该是数组（文件里是 ${brief(data.entries)}）`)
  }

  const entries: Entry[] = []
  let invalid = 0
  for (const raw of data.entries as unknown[]) {
    const entry = toEntry(raw, now)
    if (entry) entries.push(entry)
    else invalid++
  }
  return { entries, invalid }
}

/**
 * 按 id 去重合并；同 id 保留 updatedAt 较新的那条（相等时保留现有，避免无谓写库）。
 * 胜出的现有条目保持原对象引用，调用方可以据此只写回真正变化的记录。
 */
export function mergeEntries(existing: readonly Entry[], incoming: readonly Entry[]): MergeResult {
  const byId = new Map<string, Entry>()
  const existingIds = new Set<string>()
  for (const entry of existing) {
    const prev = byId.get(entry.id)
    if (!prev || entry.updatedAt > prev.updatedAt) byId.set(entry.id, entry)
    existingIds.add(entry.id)
  }

  // 恒等式：added + updated + skipped === incoming.length。
  // 每个 id 只记一次新增或更新；同一 id 的其余备份行都算 skipped，
  // 但它们仍然参与比较——同一次导入里后出现的新版本应该胜出。
  const counted = new Set<string>()
  const winners = new Map<string, boolean>()
  let added = 0
  let updated = 0
  let skipped = 0
  for (const entry of incoming) {
    const prev = byId.get(entry.id)
    if (prev && entry.updatedAt <= prev.updatedAt) {
      skipped++
      continue
    }
    byId.set(entry.id, entry)
    if (counted.has(entry.id)) {
      skipped++
      continue
    }
    counted.add(entry.id)
    const existed = existingIds.has(entry.id)
    winners.set(entry.id, existed)
    if (existed) updated++
    else added++
  }
  return { merged: sortNewestFirst([...byId.values()]), added, updated, skipped, winners }
}

/**
 * 把解析和合并的两组计数合成 UI 要的三个数。
 * `ignored` 是调用方合并之后主动排除的 id（例如正在撤销的删除记录）：
 * 它们没写进库，要从 added/updated 挪到 skipped，别让用户以为恢复成功了。
 */
export function importSummary(
  parsed: ParsedBackup,
  merged: MergeResult,
  ignored: ReadonlySet<string> = new Set<string>(),
): ImportSummary {
  let added = merged.added
  let updated = merged.updated
  let skipped = merged.skipped + parsed.invalid
  for (const [id, existed] of merged.winners) {
    if (ignored.has(id)) {
      if (existed) updated--
      else added--
      skipped++
    }
  }
  return { added, updated, skipped }
}
