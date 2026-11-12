import { importSummary, mergeEntries, parseBackup } from '../domain/import'
import type { ImportSummary } from '../domain/import'
import type { EntryStore } from '../storage/types'

/**
 * 导入落库的编排层：纯 async 函数，只依赖 EntryStore 接口，不碰 React / DOM，
 * 因此能在 Node 里直接测。useEntries 只负责把结果刷新到界面上。
 *
 * 只读库里全量记录（含删除墓碑）来做合并，避免导入把「已确认删除」的记录
 * 又带回来；正在撤销窗口里的 id 也跳过，不覆盖用户的删除意图。
 */
export async function applyBackup(
  store: EntryStore,
  text: string,
  pendingId: string | null,
): Promise<ImportSummary> {
  const parsed = parseBackup(text)
  const all = await store.all()
  const merged = mergeEntries(all, parsed.entries)
  const hidden = new Set<string>()
  if (pendingId) hidden.add(pendingId)
  for (const e of all) if (e.deleteAfter !== undefined) hidden.add(e.id)

  // 只写真正胜出的备份条目（对象引用相同即胜出），不碰任何现有记录。
  const incoming = new Set(parsed.entries)
  const writes: (typeof parsed.entries)[number][] = []
  const ignored = new Set<string>()
  for (const e of merged.merged) {
    if (!incoming.has(e)) continue
    if (hidden.has(e.id)) {
      ignored.add(e.id)
      continue
    }
    writes.push(e)
  }
  for (const e of writes) await store.put(e)
  return importSummary(parsed, merged, ignored)
}
