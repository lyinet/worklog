import { tokenizeTags } from '../domain/tags'

interface RichTextProps {
  text: string
  onTagClick?: (tag: string) => void
}

/** Prose with inline `#tags` highlighted where the user typed them. */
export function RichText({ text, onTagClick }: RichTextProps) {
  const segments = tokenizeTags(text)

  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-[#e6e6e8]">
      {segments.map((segment, index) =>
        segment.kind === 'tag' && segment.tag ? (
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTagClick?.(segment.tag as string)
            }}
            className="rounded-[5px] bg-[#182720] px-1 text-[#7ee2a8]"
          >
            {segment.value}
          </button>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  )
}
