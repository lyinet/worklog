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

export async function seedDemo(store: EntryStore): Promise<void> {
  const now = Date.now()
  const existing = await store.all()
  if (existing.length > 0) return
  for (const [text, hoursAgo] of SAMPLES) {
    const entry = createEntry({ text }, now - hoursAgo * 60 * 60 * 1000)
    await store.put(entry)
  }
}
