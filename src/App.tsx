import { useMemo, useState } from 'react'
import { CaptureBar } from './components/CaptureBar'
import { MenuSheet } from './components/MenuSheet'
import { SearchBar } from './components/SearchBar'
import { Timeline } from './components/Timeline'
import { TopBar } from './components/TopBar'
import { groupByDay } from './domain/grouping'
import { applyFilters } from './domain/search'
import { summarize } from './domain/stats'
import { useEntries } from './state/useEntries'
import { createStore } from './storage/idb'
import { MemoryStore } from './storage/types'

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
  const { entries, status, error, add, update, remove, clearAll } = useEntries(store)

  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const summary = useMemo(() => summarize(entries), [entries])
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
          />
        )}
      </main>

      <CaptureBar onAdd={add} />

      <MenuSheet
        open={menuOpen}
        entries={entries}
        onClose={() => setMenuOpen(false)}
        onClearAll={clearAll}
      />
    </div>
  )
}
