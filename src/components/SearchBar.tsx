interface SearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  tags: { tag: string; count: number }[]
  activeTag: string | null
  onTagChange: (tag: string | null) => void
}

export function SearchBar({
  query,
  onQueryChange,
  tags,
  activeTag,
  onTagChange,
}: SearchBarProps) {
  return (
    <div className="px-4 pb-2">
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜索记录或标签"
        autoComplete="off"
        className="w-full rounded-xl border border-[#232326] bg-[#131315] px-3 py-2 text-[14px] text-[#ededed] outline-none placeholder:text-[#4a4a50] focus:border-[#3a3a40]"
      />
      {tags.length > 0 && (
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => onTagChange(null)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] ${
              activeTag === null
                ? 'border-[#2f4a3c] bg-[#14201a] text-[#7ee2a8]'
                : 'border-[#232326] text-[#7a7a80]'
            }`}
          >
            全部
          </button>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] ${
                activeTag === tag
                  ? 'border-[#2f4a3c] bg-[#14201a] text-[#7ee2a8]'
                  : 'border-[#232326] text-[#7a7a80]'
              }`}
            >
              #{tag}
              <span className="ml-1 tabular-nums text-[#4a4a50]">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
