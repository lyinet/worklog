import { describe, expect, it } from 'vitest'
import type { Entry } from './types'
import { createSummary, isSummaryRangeValid, summaryBody, summaryRange, summaryToMarkdown } from './summary'
import type { SummaryPreset } from './summary'

function entry(id: string, date: string, tags: string[] = [], text = id): Entry {
  const createdAt = new Date(date).getTime()
  return { id, text, tags, createdAt, updatedAt: createdAt }
}

const RANGE = { start: '2026-11-10', end: '2026-11-16' }
const NOW = new Date(2026, 10, 18, 12).getTime()

describe('createSummary', () => {
  it('含开始和结束当天，排除相邻范围外的记录', () => {
    const summary = createSummary([
      entry('before', '2026-11-09T23:59:59.999'),
      entry('start', '2026-11-10T00:00:00'),
      entry('end', '2026-11-16T23:59:59.999'),
      entry('after', '2026-11-17T00:00:00'),
    ], RANGE)
    expect(summary.total).toBe(2)
    expect(summary.activeDays).toBe(2)
    expect(summary.rangeLabel).toBe('2026-11-10 ~ 2026-11-16')
    expect(summary.timeline.map((day) => day.key)).toEqual(['2026-11-10', '2026-11-16'])
  })

  it('午夜记录以本地日期分桶，而非 UTC 日期', () => {
    const summary = createSummary([
      entry('early', '2026-01-01T00:30:00'),
      entry('late', '2026-01-01T23:30:00'),
    ], { start: '2026-01-01', end: '2026-01-01' })
    expect(summary.total).toBe(2)
    expect(summary.activeDays).toBe(1)
    expect(summary.timeline[0]?.key).toBe('2026-01-01')
    expect(summary.timeline[0]?.entries.map((item) => item.id)).toEqual(['early', 'late'])
  })

  it('空列表返回空摘要', () => {
    const summary = createSummary([], RANGE)
    expect(summary.total).toBe(0)
    expect(summary.activeDays).toBe(0)
    expect(summary.tags).toEqual([])
    expect(summary.timeline).toEqual([])
  })

  it('范围内无记录返回空摘要', () => {
    expect(createSummary([entry('old', '2026-10-10T12:00:00')], RANGE).total).toBe(0)
  })

  it('多标签分别归组，概览只计一次；组间按条数降序', () => {
    const summary = createSummary([
      entry('a', '2026-11-14T10:00:00', ['产品', '开发']),
      entry('b', '2026-11-15T10:00:00', ['开发']),
    ], RANGE)
    expect(summary.total).toBe(2)
    expect(summary.tags.map((group) => [group.tag, group.entries.length])).toEqual([
      ['开发', 2], ['产品', 1],
    ])
  })

  it('无标签归到未分类，与真正的 #未分类 标签不混组', () => {
    const summary = createSummary([
      entry('plain', '2026-11-14T10:00:00'),
      entry('tagged', '2026-11-14T11:00:00', ['未分类']),
    ], RANGE)
    expect(summary.tags.find((group) => group.tag === null)?.entries[0]?.id).toBe('plain')
    expect(summary.tags.find((group) => group.tag === '未分类')?.entries[0]?.id).toBe('tagged')
    expect(summaryToMarkdown(summary)).toContain('## 未分类\n')
    expect(summaryToMarkdown(summary)).toContain('## #未分类\n')
  })

  it('组内与时间线按时间正序，不改变输入数组', () => {
    const entries = [
      entry('late', '2026-11-15T18:00:00', ['开发']),
      entry('mid', '2026-11-14T18:00:00', ['开发']),
      entry('early', '2026-11-14T08:00:00', ['开发']),
    ]
    const frozen = Object.freeze(entries.map((item) => Object.freeze(item)))
    const summary = createSummary(frozen, RANGE)
    expect(summary.tags[0]?.entries.map((item) => item.id)).toEqual(['early', 'mid', 'late'])
    expect(summary.timeline.map((day) => day.key)).toEqual(['2026-11-14', '2026-11-15'])
    expect(summary.timeline[0]?.entries.map((item) => item.id)).toEqual(['early', 'mid'])
    expect(entries.map((item) => item.id)).toEqual(['late', 'mid', 'early'])
  })

  it('相同条数组按名称排序，重复标签只归组一次', () => {
    const summary = createSummary([
      entry('b', '2026-11-14T10:00:00', ['b', 'b']),
      entry('a', '2026-11-14T11:00:00', ['a']),
    ], RANGE)
    expect(summary.tags.map((group) => [group.tag, group.entries.length])).toEqual([['a', 1], ['b', 1]])
  })

  it('周一零点不会混入上周', () => {
    const entries = [
      entry('sunday', '2026-11-15T23:59:59.999'),
      entry('monday', '2026-11-16T00:00:00'),
    ]
    const now = new Date(2026, 10, 16).getTime()
    expect(createSummary(entries, summaryRange('thisWeek', now)).total).toBe(1)
    expect(createSummary(entries, summaryRange('lastWeek', now)).tags[0]?.entries[0]?.id).toBe('sunday')
  })

  it('跨年范围按本地日排序', () => {
    const summary = createSummary([
      entry('new', '2026-01-01T00:30:00'),
      entry('old', '2025-12-31T23:30:00'),
    ], { start: '2025-12-31', end: '2026-01-01' })
    expect(summary.activeDays).toBe(2)
    expect(summary.timeline.map((day) => day.key)).toEqual(['2025-12-31', '2026-01-01'])
  })
})

describe('summaryRange', () => {
  it.each<[SummaryPreset, string, string]>([
    ['thisWeek', '2026-11-16', '2026-11-22'],
    ['lastWeek', '2026-11-09', '2026-11-15'],
    ['recent7', '2026-11-12', '2026-11-18'],
    ['thisMonth', '2026-11-01', '2026-11-30'],
  ])('%s 预设使用完整本地日历范围', (preset, start, end) => {
    expect(summaryRange(preset, NOW)).toEqual({ start, end })
  })

  it('周日仍属于当前周，周一切换到新周', () => {
    expect(summaryRange('thisWeek', new Date(2026, 10, 15, 23, 59).getTime()))
      .toEqual({ start: '2026-11-09', end: '2026-11-15' })
    expect(summaryRange('thisWeek', new Date(2026, 10, 16).getTime()))
      .toEqual({ start: '2026-11-16', end: '2026-11-22' })
  })

  it('跨年周和最近 7 天不截断到当年', () => {
    const now = new Date(2026, 0, 1, 12).getTime()
    expect(summaryRange('thisWeek', now)).toEqual({ start: '2025-12-29', end: '2026-01-04' })
    expect(summaryRange('lastWeek', now)).toEqual({ start: '2025-12-22', end: '2025-12-28' })
    expect(summaryRange('recent7', now)).toEqual({ start: '2025-12-26', end: '2026-01-01' })
  })

  it('闰年二月包含 29 日', () => {
    expect(summaryRange('thisMonth', new Date(2024, 1, 12).getTime()))
      .toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it.each<[number, number, number, string, string, string, string]>([
    [2026, 2, 9, '2026-03-09', '2026-03-15', '2026-03-02', '2026-03-08'],
    [2026, 10, 2, '2026-11-02', '2026-11-08', '2026-10-26', '2026-11-01'],
  ])('夏令时切换后仍从周一开始（%i-%i-%i）', (year, month, date, start, end, lastStart, lastEnd) => {
    const now = new Date(year, month, date, 12).getTime()
    expect(summaryRange('thisWeek', now)).toEqual({ start, end })
    expect(summaryRange('lastWeek', now)).toEqual({ start: lastStart, end: lastEnd })
  })

  it('最近 7 天跨夏令时仍是 7 个日历日', () => {
    expect(summaryRange('recent7', new Date(2026, 10, 3, 12).getTime()))
      .toEqual({ start: '2026-10-28', end: '2026-11-03' })
  })
})

describe('日期校验', () => {
  it.each([
    { start: '', end: '2026-11-16' },
    { start: '2026-11-17', end: '2026-11-16' },
    { start: '2026-02-30', end: '2026-11-16' },
    { start: '2026-1-1', end: '2026-11-16' },
  ])('拒绝无效或倒置日期 %o', (range) => {
    expect(isSummaryRangeValid(range)).toBe(false)
    expect(() => createSummary([], range)).toThrow('请选择有效的日期范围')
  })
})

describe('summaryToMarkdown', () => {
  it('生成中文标题、概览、标签小节和每天的时间线', () => {
    const summary = createSummary([
      entry('a', '2026-11-14T09:05:00', ['开发'], '完成周报导出 #开发'),
    ], RANGE)
    expect(summaryToMarkdown(summary)).toBe([
      '# 工作周报 · 2026-11-10 ~ 2026-11-16', '',
      '共 1 条记录 · 有记录 1 天', '',
      '## #开发', '',
      '- 2026-11-14 09:05 完成周报导出 #开发', '',
      '## 时间线', '',
      '### 11月14日 周六', '',
      '- 09:05 完成周报导出 #开发', '',
    ].join('\n'))
  })

  it('空范围也输出可阅读的周报', () => {
    expect(summaryToMarkdown(createSummary([], RANGE))).toBe([
      '# 工作周报 · 2026-11-10 ~ 2026-11-16', '',
      '共 0 条记录 · 有记录 0 天', '',
      '这段时间没有记录。', '',
    ].join('\n'))
  })

  it('纯标签正文不丢失，多行正文保持在列表项内', () => {
    const markdown = summaryToMarkdown(createSummary([
      entry('tags', '2026-11-14T10:00:00', ['开发'], '#开发'),
      entry('multiline', '2026-11-14T11:00:00', [], '检查构建\n补充测试'),
    ], RANGE))
    expect(markdown).toContain('- 2026-11-14 10:00 #开发')
    expect(markdown).toContain('- 2026-11-14 11:00 检查构建\n  补充测试')
  })
})

describe('summaryBody', () => {
  it.each([
    '补 #api 的限流中间件',
    '调通了 #api 的鉴权，token 过期能自动刷新了',
    '和 #需求 方过了一版交互稿',
    '写 #测试 覆盖编辑回滚',
    '补了 #测试 ，覆盖标签解析的边界情况',
  ])('保留中文原文及行内标签：%s', (text) => {
    expect(summaryBody(text)).toBe(text)
  })

  it.each([
    '补 #api ，token 过期后刷新',
    '补了 #测试 ， token 过期后刷新',
    '完成 API #开发 测试 3 次',
    '写 #测试 覆盖 3 个 API',
  ])('保留中英数字混排原文：%s', (text) => {
    expect(summaryBody(text)).toBe(text)
  })

  it('保留多行原文和标点两侧空格', () => {
    const text = '完成 #开发 ， #测试 补测试\n检查 #构建 结果'
    expect(summaryBody(text)).toBe(text)
  })

  it('保留前后空格和制表符', () => {
    const text = '  检查\tAPI #开发 ，完成测试  '
    expect(summaryBody(text)).toBe(text)
  })

  it('纯标签原样保留，时间线不追加重复标签', () => {
    expect(summaryBody('#测试')).toBe('#测试')
    const markdown = summaryToMarkdown(createSummary([
      entry('tag-only', '2026-11-14T10:00:00', ['测试'], '#测试'),
    ], RANGE))
    expect(markdown).toContain('- 2026-11-14 10:00 #测试')
    expect(markdown).toContain('- 10:00 #测试\n')
    expect(markdown).not.toContain('#测试 #测试')
  })

  it('相邻多标签和分隔空格原样保留', () => {
    expect(summaryBody('补 #api#测试 的边界情况')).toBe('补 #api#测试 的边界情况')
    expect(summaryBody('和 #设计 #产品 方对齐')).toBe('和 #设计 #产品 方对齐')
  })

  it('整条相邻多标签不去重或改写', () => {
    expect(summaryBody('#开发#测试 #开发')).toBe('#开发#测试 #开发')
  })

  it('空白正文保留原空白并加提示，不输出空列表项', () => {
    expect(summaryBody(' \t ')).toBe(' \t （无正文）')
  })

  it('生成的正文原样包含词中间夹标签的记录', () => {
    const text = '和 #需求 方过了一版交互稿'
    const markdown = summaryToMarkdown(createSummary([
      entry('requirement', '2026-11-14T10:00:00', ['需求'], text),
    ], RANGE))
    expect(markdown).toContain('- 2026-11-14 10:00 ' + text + '\n')
    expect(markdown).toContain('- 10:00 ' + text + '\n')
    expect(markdown).not.toContain('和方')
  })

  it('标签分组标题不变，多标签记录原文出现在每个组', () => {
    const text = '补 #api#测试 的边界情况'
    const markdown = summaryToMarkdown(createSummary([
      entry('multi', '2026-11-14T11:00:00', ['api', '测试'], text),
    ], RANGE))
    expect(markdown).toContain('## #api\n\n- 2026-11-14 11:00 ' + text)
    expect(markdown).toContain('## #测试\n\n- 2026-11-14 11:00 ' + text)
    expect(markdown.split('- 2026-11-14 11:00 ' + text).length - 1).toBe(2)
  })

  it('Markdown 保留多行正文的字符、CRLF 和末尾空格，只加列表缩进', () => {
    const text = '  和 #需求 方对齐\r\n检查 #api 的结果  '
    const markdown = summaryToMarkdown(createSummary([
      entry('multiline-raw', '2026-11-14T12:00:00', ['需求', 'api'], text),
    ], RANGE))
    expect(markdown).toContain('- 2026-11-14 12:00   和 #需求 方对齐\r\n  检查 #api 的结果  \n')
    expect(markdown).toContain('- 12:00   和 #需求 方对齐\r\n  检查 #api 的结果  \n')
  })
})
