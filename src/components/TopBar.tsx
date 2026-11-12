interface TopBarProps {
  todayCount: number
  weekCount: number
  total: number
  searching: boolean
  onToggleSearch: () => void
  onOpenMenu: () => void
}

export function TopBar({
  todayCount,
  weekCount,
  total,
  searching,
  onToggleSearch,
  onOpenMenu,
}: TopBarProps) {
  return (
    <header className="safe-top flex items-start gap-3 px-4 pt-2 pb-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[19px] font-semibold tracking-tight text-[#f2f2f4]">工作簿</h1>
        <p className="mt-0.5 text-[12px] tabular-nums text-[#5d5d64]">
          今天 {todayCount} 条 · 本周 {weekCount} 条 · 共 {total} 条
        </p>
      </div>
      <button
        onClick={onToggleSearch}
        aria-label="搜索"
        className={`rounded-xl border px-2.5 py-1.5 text-[13px] ${
          searching
            ? 'border-[#2f4a3c] bg-[#14201a] text-[#7ee2a8]'
            : 'border-[#232326] text-[#8b8b90]'
        }`}
      >
        搜索
      </button>
      <button
        onClick={onOpenMenu}
        aria-label="更多"
        className="rounded-xl border border-[#232326] px-2.5 py-1.5 text-[13px] text-[#8b8b90]"
      >
        ⋯
      </button>
    </header>
  )
}
