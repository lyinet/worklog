import { describe, expect, it } from 'vitest'
import { appendTag, parseTags, removeTagFromText, stripTags, tokenizeTags } from './tags'

describe('parseTags', () => {
  it('finds inline tags and lowercases them', () => {
    expect(parseTags('修了 #登录 的 bug #Bug')).toEqual(['登录', 'bug'])
  })

  it('dedupes repeated tags', () => {
    expect(parseTags('#api 调通了 #API')).toEqual(['api'])
  })

  it('stops at Chinese punctuation', () => {
    expect(parseTags('#上线，然后#交付。')).toEqual(['上线', '交付'])
  })

  it('keeps slash-joined tags intact', () => {
    expect(parseTags('#上线/支付 完成')).toEqual(['上线/支付'])
  })

  it('ignores a bare hash and hashes with no body', () => {
    expect(parseTags('issue # 123 and #')).toEqual([])
  })

  it('does not treat hyphens or underscores as separators', () => {
    expect(parseTags('#code-review #hot_fix')).toEqual(['code-review', 'hot_fix'])
  })
})

describe('stripTags', () => {
  it('removes tags but keeps the prose', () => {
    expect(stripTags('修了 #登录 的 bug')).toBe('修了 的 bug')
  })

  it('collapses the space left behind', () => {
    expect(stripTags('#a #b 只有正文')).toBe('只有正文')
  })
})

describe('removeTagFromText', () => {
  it('removes only the first matching tag occurrence', () => {
    expect(removeTagFromText('#api 和 #api 两次', 'api')).toBe('和 两次')
  })

  it('leaves other tags alone', () => {
    expect(removeTagFromText('#a #b', 'a')).toBe('#b')
  })
})

describe('appendTag', () => {
  it('appends with a space', () => {
    expect(appendTag('写完了', 'api')).toBe('写完了 #api')
  })

  it('does not duplicate', () => {
    expect(appendTag('写完了 #api', 'api')).toBe('写完了 #api')
  })

  it('normalizes a leading hash and case', () => {
    expect(appendTag('x', '#API')).toBe('x #api')
  })
})

describe('tokenizeTags', () => {
  it('keeps tags in place so the sentence still reads', () => {
    expect(tokenizeTags('调通了 #api 的鉴权')).toEqual([
      { kind: 'text', value: '调通了 ' },
      { kind: 'tag', value: '#api', tag: 'api' },
      { kind: 'text', value: ' 的鉴权' },
    ])
  })

  it('round-trips the original text', () => {
    const text = '修了 #登录 的 #bug。'
    expect(tokenizeTags(text).map((s) => s.value).join('')).toBe(text)
  })

  it('returns a single text segment when there are no tags', () => {
    expect(tokenizeTags('没有标签')).toEqual([{ kind: 'text', value: '没有标签' }])
  })
})
