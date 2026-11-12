import type { DayGroup, Entry } from '../domain/types'
import { EntryRow } from './EntryRow'

interface TimelineProps {
  groups: DayGroup<Entry>[]
  onUpdate: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTagClick: (tag: string) => void
}

export function Timeline({ groups, onUpdate, onDelete, onTagClick }: TimelineProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-[15px] text-[#5d5d64]">还没有记录</p>
        <p className="mt-1 text-[13px] text-[#3f3f45]">在下面输入框写一句，回车即可</p>
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
