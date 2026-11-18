import { describe, expect, it, vi } from 'vitest'
import type { Entry } from '../domain/types'
import type { PendingCapture } from '../plugins/captureNotification'
import { MemoryStore } from '../storage/types'
import { importNotificationEntries, isPendingCapture, saveNotificationEntry } from './notificationEntries'

function capture(index = 1, text = '  做完了 #工作  '): PendingCapture {
  return {
    id: 'notification-00000000-0000-4000-8000-' + index.toString().padStart(12, '0'),
    text,
    createdAt: 1_795_017_599_000 + index,
  }
}

function fixture(initial = [capture()]) {
  let pending = initial
  let inFlight: PendingCapture[] = []
  let claimed = false
  const queue = {
    drain: vi.fn(async () => {
      if (claimed) return { entries: [], dropped: 0 }
      if (!inFlight.length) {
        inFlight = pending
        pending = []
      }
      claimed = inFlight.length > 0
      return { entries: [...inFlight], dropped: 0 }
    }),
    acknowledge: vi.fn(async (ids: string[]) => {
      inFlight = inFlight.filter((entry) => !ids.includes(entry.id))
    }),
    release: vi.fn(async () => { claimed = false }),
  }
  const store = new MemoryStore()
  const add = vi.fn((text: string, source: Pick<PendingCapture, 'id' | 'createdAt'>) =>
    saveNotificationEntry(store, text, source))
  return { queue, store, add, append: (entry: PendingCapture) => pending.push(entry) }
}

describe('通知回复入库', () => {
  it('清洗正文、复用标签规则，时间取原生接收时刻', async () => {
    const { queue, add, store } = fixture()
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 1, dropped: 0 })
    expect(await store.all()).toEqual([expect.objectContaining({
      id: capture().id, text: '做完了 #工作', tags: ['工作'], createdAt: capture().createdAt,
    })])
    expect(queue.acknowledge).toHaveBeenCalledWith([capture().id])
  })

  it('不按相同文本去重，分别发出的相同正文保留两条', async () => {
    const { queue, add, store } = fixture([capture(1), capture(2)])
    await importNotificationEntries(queue, add)
    expect(await store.all()).toHaveLength(2)
  })

  it('重复 drain 与并发打开不会重复落库', async () => {
    const { queue, add, store } = fixture()
    await Promise.all([importNotificationEntries(queue, add), importNotificationEntries(queue, add)])
    expect(await store.all()).toHaveLength(1)
    expect(add).toHaveBeenCalledOnce()
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 0, dropped: 0 })
  })

  it('只在磁盘写入完成之后确认，处理中来的新回复下一批继续补入', async () => {
    const { queue, add, store, append } = fixture()
    const acknowledge = queue.acknowledge.getMockImplementation()!
    queue.acknowledge.mockImplementationOnce(async (ids) => {
      expect((await store.all()).map((entry) => entry.id)).toContain(ids[0])
      append(capture(2))
      await acknowledge(ids)
    })
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 2, dropped: 0 })
    expect(await store.all()).toHaveLength(2)
  })

  it('逐条确认；第二条写入失败后只重试未确认的记录', async () => {
    const { queue, add, store } = fixture([capture(1), capture(2)])
    add.mockImplementationOnce((text, source) => saveNotificationEntry(store, text, source))
      .mockRejectedValueOnce(new Error('disk full'))
    await expect(importNotificationEntries(queue, add)).rejects.toThrow('disk full')
    expect(queue.acknowledge).toHaveBeenCalledTimes(1)
    expect(queue.release).toHaveBeenCalledOnce()
    await importNotificationEntries(queue, add)
    expect(await store.all()).toHaveLength(2)
    expect(add).toHaveBeenCalledTimes(3)
  })

  it('add 返回 null 不是成功，不确认并保留以供下次打开', async () => {
    const { queue, add, store } = fixture()
    add.mockResolvedValueOnce(null)
    await expect(importNotificationEntries(queue, add)).rejects.toThrow('通知记录入库失败')
    expect(queue.acknowledge).not.toHaveBeenCalled()
    await importNotificationEntries(queue, add)
    expect(await store.all()).toHaveLength(1)
  })

  it('确认失败后的重放沿用稳定编号，保留用户已编辑的内容', async () => {
    const { queue, add, store } = fixture()
    queue.acknowledge.mockRejectedValueOnce(new Error('bridge lost'))
    await expect(importNotificationEntries(queue, add)).rejects.toThrow('bridge lost')
    const stored = (await store.all())[0]!
    await store.put({ ...stored, text: '已修改', tags: [] })
    await importNotificationEntries(queue, add)
    expect(await store.all()).toEqual([{ ...stored, text: '已修改', tags: [] }])
  })

  it('重放不会覆盖待删除标记', async () => {
    const { queue, add, store } = fixture()
    const existing: Entry = {
      ...capture(), text: '原文', tags: [], updatedAt: capture().createdAt, deleteAfter: Date.now() + 5000,
    }
    await store.put(existing)
    await importNotificationEntries(queue, add)
    expect(await store.all()).toEqual([existing])
  })

  it('空白正文被消费但不记入补入条数', async () => {
    const { queue, add, store } = fixture([capture(1, '　 \n\t\ufeff')])
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 0, dropped: 0 })
    expect(await store.all()).toEqual([])
    expect(add).not.toHaveBeenCalled()
    expect(queue.acknowledge).toHaveBeenCalledOnce()
  })

  it('损坏记录不悄悄丢弃或伪造接收时间', async () => {
    const { queue, add } = fixture([{ ...capture(), createdAt: NaN }])
    await expect(importNotificationEntries(queue, add)).rejects.toThrow('通知记录格式错误')
    expect(queue.acknowledge).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(queue.release).toHaveBeenCalledOnce()
  })

  it.each([null, {}, { ...capture(), id: 'bad' }, { ...capture(), text: 5 },
    { ...capture(), createdAt: -1 }, { ...capture(), createdAt: Infinity },
    { ...capture(), createdAt: 1.5 }, { ...capture(), createdAt: 8_640_000_000_000_001 }])(
    '拒绝非法桥接记录 %j', (value) => {
      expect(isPendingCapture(value)).toBe(false)
    },
  )

  it('保存前也校验来源，不写入错误编号', async () => {
    const store = new MemoryStore()
    await expect(saveNotificationEntry(store, 'text', { id: 'bad', createdAt: 1 })).rejects.toThrow('格式错误')
    expect(await store.all()).toEqual([])
  })

  it('传递溢出计数供界面诚实提示', async () => {
    const { queue, add } = fixture([])
    queue.drain.mockResolvedValue({ entries: [], dropped: 3 })
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 0, dropped: 3 })
  })

  it('分批返回的已消费溢出计数相加，不忽略入库期间新增的丢弃', async () => {
    const { queue, add } = fixture([])
    queue.drain.mockResolvedValueOnce({ entries: [capture()], dropped: 3 })
      .mockResolvedValueOnce({ entries: [], dropped: 2 })
    expect(await importNotificationEntries(queue, add)).toEqual({ added: 1, dropped: 5 })
  })

  it('桥接读取失败不会被当作空队列', async () => {
    const { queue, add } = fixture()
    queue.drain.mockRejectedValueOnce(new Error('bridge unavailable'))
    await expect(importNotificationEntries(queue, add)).rejects.toThrow('bridge unavailable')
    expect(add).not.toHaveBeenCalled()
  })

  it('关掉开关或卸载时不再取队列', async () => {
    const { queue, add } = fixture()
    expect(await importNotificationEntries(queue, add, () => false)).toEqual({ added: 0, dropped: 0 })
    expect(queue.drain).not.toHaveBeenCalled()
  })

  it('处理中关闭开关，不再导入该批剩余记录', async () => {
    const { queue, add, store } = fixture([capture(1), capture(2)])
    let active = true
    const acknowledge = queue.acknowledge.getMockImplementation()!
    queue.acknowledge.mockImplementationOnce(async (ids) => {
      active = false
      await acknowledge(ids)
    })
    await importNotificationEntries(queue, add, () => active)
    expect(await store.all()).toHaveLength(1)
    expect(add).toHaveBeenCalledOnce()
    expect(queue.release).toHaveBeenCalledOnce()
  })
})
