import type { Entry } from './types'

/**
 * Case-insensitive substring match over prose and tags. Substring (not token)
 * matching is deliberate: it works for Chinese, where words are not
 * whitespace-delimited, and for half-typed queries.
 */
export function matchesQuery(entry: Entry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (entry.text.toLowerCase().includes(q)) return true
  return entry.tags.some((tag) => tag.includes(q.replace(/^#/, '')))
}

/** Every entry that carries the given tag (already normalized). */
export function filterByTag(entries: readonly Entry[], tag: string | null): Entry[] {
  if (!tag) return [...entries]
  return entries.filter((e) => e.tags.includes(tag))
}

export function applyFilters(
  entries: readonly Entry[],
  { query, tag }: { query: string; tag: string | null },
): Entry[] {
  return entries.filter((e) => matchesQuery(e, query) && (!tag || e.tags.includes(tag)))
}
