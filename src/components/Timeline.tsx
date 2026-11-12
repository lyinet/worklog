import type { DayGroup, Entry } from '../domain/types'
import { EntryRow } from './EntryRow'

interface TimelineProps {
  groups: DayGroup<Entry>[]
  onUpdate: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTagClick: (tag: string) => void
  onTryRecord: () => void
}

export function Timeline({ groups, onUpdate, onDelete, onTagClick, onTryRecord }: TimelineProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[17px] font-medium text-[#c9c9ce]">还没有记录</p>
        <p className="mt-3 text-[13px] leading-6 text-[#6b6b72]">
          写一句就行，用 <span className="text-[#7ee2a8]">#标签</span> 归类
        </p>
        <p className="text-[13px] leading-6 text-[#6b6b72]">所有数据只存在这台手机上</p>
        <button
          onClick={onTryRecord}
          className="mt-5 rounded-xl border border-[#2f4a3c] bg-[#14201a] px-5 py-2.5 text-[14px] font-medium text-[#7ee2a8] transition active:scale-95"
        >
          试试记一条
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline gap-2 bg-[#0b0b0c]/95 px-4 py-2 backdrop-blur">
            <span className="text-[13px] font-medium text-[#c9c9ce]">
              {group.relative ?? group.label}
            </span>
            {group.relative && <span className="text-[12px] text-[#4a4a50]">{group.label}</span>}
            <span className="ml-auto text-[12px] tabular-nums text-[#4a4a50]">
              {group.entries.length} 条
            </span>
          </h2>
          <div className="divide-y divide-[#17171a]">
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
