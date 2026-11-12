import type { DayCount, Stats, TagCount } from '../domain/stats'

interface StatsSheetProps {
  open: boolean
  stats: Stats
  onClose: () => void
}

/** 本周比上周：上周 0 条时 deltaPct 为 null，这里给不出百分比的文案。 */
function deltaLabel(deltaPct: number | null): string {
  if (deltaPct === null) return '—'
  return `${deltaPct > 0 ? '+' : ''}${deltaPct}%`
}

function deltaTone(deltaPct: number | null): string {
  if (deltaPct === null) return 'text-[#5d5d64]'
  if (deltaPct > 0) return 'text-[#7ee2a8]'
  if (deltaPct < 0) return 'text-[#e08b8b]'
  return 'text-[#8b8b90]'
}

/** 有记录时按条数给 #7ee2a8 的透明度梯度，0 条用纯底色。 */
const HEAT_ALPHAS = [0.28, 0.48, 0.68, 0.85, 1] as const
const EMPTY_COLOR = '#1b1b1f'

function heatColor(count: number, max: number): string {
  if (count === 0) return EMPTY_COLOR
  if (max <= 1) return `rgba(126, 226, 168, 1)`
  const level = Math.ceil((count / max) * (HEAT_ALPHAS.length - 1))
  const alpha = HEAT_ALPHAS[Math.max(0, Math.min(HEAT_ALPHAS.length - 1, level))] ?? 1
  return `rgba(126, 226, 168, ${alpha})`
}

function Heatmap({ days }: { days: readonly DayCount[] }) {
  const max = days.reduce((m, d) => Math.max(m, d.count), 0)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-medium text-[#c9c9ce]">最近 30 天</h3>
        <span className="text-[11px] tabular-nums text-[#4a4a50]">共 {days.reduce((s, d) => s + d.count, 0)} 条</span>
      </div>
      <div className="grid grid-cols-10 gap-1.5">
        {days.map((d) => (
          <div
            key={d.key}
            title={`${d.key} · ${d.count} 条`}
            aria-label={`${d.key} ${d.count} 条`}
            style={{ backgroundColor: heatColor(d.count, max) }}
            className="aspect-square rounded-[3px]"
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-[#4a4a50]">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: heatColor(i, 4) }}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}

function TagBars({ tags }: { tags: readonly TagCount[] }) {
  const max = tags.reduce((m, t) => Math.max(m, t.count), 0)
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium text-[#c9c9ce]">标签分布</h3>
      <div className="space-y-2">
        {tags.map(({ tag, count }) => (
          <div key={tag} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-[12px] text-[#8b8b90]">#{tag}</span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#1b1b1f]">
              <div
                className="h-full rounded-full bg-[#7ee2a8]"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-[#5d5d64]">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsSheet({ open, stats, onClose }: StatsSheetProps) {
  if (!open) return null

  const empty = stats.total === 0

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="safe-bottom relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-[#232326] bg-[#131315] p-4">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#2f2f34]" />
        <h2 className="mb-3 px-1 text-[15px] font-semibold text-[#f2f2f4]">统计</h2>

        {empty ? (
          <div className="flex flex-col items-center py-14 text-center">
            <p className="text-[15px] text-[#8b8b90]">还没有记录</p>
            <p className="mt-1 text-[13px] text-[#4a4a50]">记下第一条，这里就能看到节奏了</p>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#232326] bg-[#1b1b1f] px-2 py-3 text-center">
                <div className="text-[22px] font-semibold tabular-nums text-[#7ee2a8]">
                  {stats.streak}
                </div>
                <div className="mt-0.5 text-[11px] text-[#5d5d64]">连续天数</div>
              </div>
              <div className="rounded-xl border border-[#232326] bg-[#1b1b1f] px-2 py-3 text-center">
                <div className="text-[22px] font-semibold tabular-nums text-[#e6e6e8]">
                  {stats.week.thisWeek}
                </div>
                <div className="mt-0.5 text-[11px] text-[#5d5d64]">本周条数</div>
              </div>
              <div className="rounded-xl border border-[#232326] bg-[#1b1b1f] px-2 py-3 text-center">
                <div className={`text-[22px] font-semibold tabular-nums ${deltaTone(stats.week.deltaPct)}`}>
                  {deltaLabel(stats.week.deltaPct)}
                </div>
                <div className="mt-0.5 text-[11px] text-[#5d5d64]">比上周</div>
              </div>
            </div>

            <div className="space-y-5">
              <Heatmap days={stats.days} />
              {stats.tags.length > 0 ? (
                <TagBars tags={stats.tags} />
              ) : (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-[#c9c9ce]">标签分布</h3>
                  <p className="text-[12px] text-[#4a4a50]">还没用过标签</p>
                </div>
              )}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#1b1b1f] py-3 text-[15px] text-[#8b8b90]"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
