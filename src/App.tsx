import { useEffect, useMemo, useRef, useState } from 'react'
import { CaptureBar } from './components/CaptureBar'
import { MenuSheet } from './components/MenuSheet'
import { SearchBar } from './components/SearchBar'
import { StatsSheet } from './components/StatsSheet'
import { Timeline } from './components/Timeline'
import { TopBar } from './components/TopBar'
import { UndoBar } from './components/UndoBar'
import { groupByDay } from './domain/grouping'
import { applyFilters } from './domain/search'
import { computeStats, summarize } from './domain/stats'
import { useEntries } from './state/useEntries'
import { createStore } from './storage/idb'
import { MemoryStore } from './storage/types'

/** 原生壳里手动拉起软键盘；浏览器里什么都不做。 */
async function showNativeKeyboard(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { Keyboard } = await import('@capacitor/keyboard')
    await Keyboard.show()
  } catch {
    // 键盘没弹出来不影响记录本身，静默失败
  }
}

function makeStore() {
  try {
    return createStore()
  } catch {
    // Private mode / no IndexedDB: keep the app usable, just not persistent.
    return new MemoryStore()
  }
}

export default function App() {
  const store = useMemo(makeStore, [])
  const {
    entries,
    status,
    error,
    add,
    update,
    remove,
    undoRemove,
    pendingRemoval,
    clearAll,
    importBackup,
  } = useEntries(store)

  const captureInputRef = useRef<HTMLInputElement>(null)

  // 桌面小部件带 ?focus=capture 启动：等首帧渲染完再聚焦输入框。
  // WebView 里 focus() 只给焦点、不会拉起软键盘，原生壳要额外调 Keyboard.show()。
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('focus')) return
    // WebView 里首次渲染时输入连接还没建立，立刻 showSoftInput 会被丢掉，
    // 所以聚焦和唤起键盘各重试几次，覆盖慢设备 / 冷启动的时序。
    const timers = [0, 250, 700].map((delay) =>
      window.setTimeout(() => {
        captureInputRef.current?.focus()
        void showNativeKeyboard()
      }, delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // 仅开发期：?stats=1 直接展开统计面板，方便截图自查
  const [statsOpen, setStatsOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('stats'),
  )

  const summary = useMemo(() => summarize(entries), [entries])
  const stats = useMemo(() => computeStats(entries), [entries])
  const visible = useMemo(
    () => applyFilters(entries, { query, tag: activeTag }),
    [entries, query, activeTag],
  )
  const groups = useMemo(() => groupByDay(visible), [visible])

  const filtered = query.trim() !== '' || activeTag !== null

  return (
    <div className="flex h-full flex-col bg-[#0b0b0c]">
      <TopBar
        todayCount={summary.today}
        weekCount={summary.thisWeek}
        total={summary.total}
        searching={searching}
        onToggleSearch={() => {
          setSearching((v) => !v)
          if (searching) {
            setQuery('')
            setActiveTag(null)
          }
        }}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {searching && (
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          tags={summary.tags}
          activeTag={activeTag}
          onTagChange={setActiveTag}
        />
      )}

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-[#5a2a2a] bg-[#1d1414] px-3 py-2 text-[12px] text-[#e8b4b4]">
          存储出错：{error}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-6">
        {status === 'loading' ? (
          <p className="py-16 text-center text-[13px] text-[#4a4a50]">加载中…</p>
        ) : filtered && visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] text-[#5d5d64]">没有匹配的记录</p>
            <button
              onClick={() => {
                setQuery('')
                setActiveTag(null)
              }}
              className="mt-2 text-[13px] text-[#7ee2a8]"
            >
              清除筛选
            </button>
          </div>
        ) : (
          <Timeline
            groups={groups}
            onUpdate={update}
            onDelete={remove}
            onTagClick={(tag) => {
              setSearching(true)
              setActiveTag(tag)
            }}
            onTryRecord={() => captureInputRef.current?.focus()}
          />
        )}
      </main>

      <CaptureBar onAdd={add} inputRef={captureInputRef} />

      <UndoBar pending={pendingRemoval} onUndo={() => void undoRemove()} />

      <MenuSheet
        open={menuOpen}
        entries={entries}
        onClose={() => setMenuOpen(false)}
        onClearAll={clearAll}
        onImportBackup={importBackup}
        onOpenStats={() => setStatsOpen(true)}
      />

      <StatsSheet
        open={statsOpen}
        stats={stats}
        onClose={() => setStatsOpen(false)}
      />
    </div>
  )
}
