/**
 * Tags are typed inline as `#标签` and are part of the entry text, not a
 * separate field the user has to manage. A tag runs until whitespace or
 * punctuation, so `#上线/支付` stays one tag but `#上线，` does not.
 */
const TAG_PATTERN = /#([^\s#，。！？、；：,.!?;:()[\]{}"'“”‘’]+)/gu

/** Characters that may never appear inside a tag. */
export const TAG_STOP_CHARS = /[\s#，。！？、；：,.!?;:()[\]{}"'“”‘’]/u

export function parseTags(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(TAG_PATTERN)) {
    const raw = match[1]
    if (!raw) continue
    const tag = normalizeTag(raw)
    if (tag) found.add(tag)
  }
  return [...found]
}

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Strip every inline tag, leaving the prose to display on its own. */
export function stripTags(text: string): string {
  return text.replace(TAG_PATTERN, ' ').replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Remove one tag occurrence from the raw text. Used when the user deletes a
 * tag chip; only the first occurrence is touched so repeated tags survive.
 */
export function removeTagFromText(text: string, tag: string): string {
  const target = normalizeTag(tag)
  return text
    .replace(TAG_PATTERN, (full, inner: string) =>
      normalizeTag(inner) === target ? '' : full,
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export interface TextSegment {
  kind: 'text' | 'tag'
  value: string
  /** Tag name without the leading `#`; only set when `kind` is `tag`. */
  tag?: string
}

/**
 * Split text into prose and tag segments so the UI can highlight tags in place.
 * Tags stay inside the sentence — Chinese prose reads wrong when they are cut
 * out and spliced back together.
 */
export function tokenizeTags(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, start) })
    const inner = match[1] ?? ''
    segments.push({ kind: 'tag', value: match[0], tag: normalizeTag(inner) })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) })
  return segments
}

/** Append `#tag` to text, respecting existing whitespace. */
export function appendTag(text: string, tag: string): string {
  const clean = normalizeTag(tag).replace(/#/g, '')
  if (!clean) return text
  if (parseTags(text).includes(clean)) return text
  const base = text.trimEnd()
  return base ? `${base} #${clean}` : `#${clean}`
}
