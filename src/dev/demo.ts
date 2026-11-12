import type { EntryStore } from '../storage/types'
import { createEntry } from '../domain/entries'

/**
 * Dev-only sample data, enabled with `?demo` so the timeline can be seen
 * without typing a week of entries by hand. Never loaded in a production build.
 */
const SAMPLES: [string, number][] = [
  ['调通了 #api 的鉴权，token 过期能自动刷新了', 0.4],
  ['和产品对了 #需求 边界：先不做多端同步', 2.5],
  ['修了登录页在 Safari 下的 #bug，是 flex 高度算错', 4],
  ['把 #部署 脚本从 shell 迁到 pnpm task，CI 快了一分半', 7],
  ['周会：下周三之前交出 #v1 可用版本', 26],
  ['补了 #测试，覆盖标签解析的边界情况', 28],
  ['读了竞品，结论是没人做好「3 秒记一条」这件事', 31],
  ['重构 #存储 层，抽成接口，之后换 SQLite 不动业务', 50],
]

/**
 * ?demo 的补充样例：铺满最近 30 天，让热力图和标签分布在截图里看得出来。
 * 只在空库时灌入，且仅开发期生效；不改动真实数据。
 */
function seedStatsSamples(store: EntryStore, now: number): Promise<void> {
  const texts = [
    '修 #bug：列表滚动到底会闪一下',
    '补 #api 的限流中间件',
    '和 #需求 方过了一版交互稿',
    '写 #测试 覆盖编辑回滚',
    '#部署 灰度到 10%',
    '整理 #文档，把接入步骤补完',
    '看 #性能 面板，首屏还是慢',
    '处理 #bug：深色模式下的边框',
    '给 #api 加了分页',
    '#需求 评审：统计面板要不要做',
  ]

  const puts: Promise<void>[] = []
  const DAY = 24 * 60 * 60 * 1000
  for (let daysAgo = 1; daysAgo <= 29; daysAgo++) {
    // 隔几天留白，热力图才有深浅对比
    if (daysAgo % 7 === 0 || daysAgo % 11 === 0) continue
    const perDay = daysAgo % 3 === 0 ? 3 : daysAgo % 2 === 0 ? 2 : 1
    for (let i = 0; i < perDay; i++) {
      const at = now - daysAgo * DAY - i * 60 * 60 * 1000
      const text = texts[(daysAgo + i) % texts.length] ?? texts[0] ?? '记一条'
      puts.push(store.put(createEntry({ text }, at)))
    }
  }
  return Promise.all(puts).then(() => undefined)
}

export async function seedDemo(store: EntryStore): Promise<void> {
  const now = Date.now()
  const existing = await store.all()
  if (existing.length > 0) return
  for (const [text, hoursAgo] of SAMPLES) {
    const entry = createEntry({ text }, now - hoursAgo * 60 * 60 * 1000)
    await store.put(entry)
  }
  await seedStatsSamples(store, now)
}
