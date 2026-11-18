import { useEffect, useState } from 'react'
import {
  acknowledgePendingCaptures,
  drainPendingCaptures,
  releasePendingCaptures,
  supportsCaptureNotification,
  watchCaptureNotificationStatus,
  watchPendingCaptures,
} from '../plugins/captureNotification'
import { importNotificationEntries } from './notificationEntries'
import type { UseEntries } from './useEntries'

let imports: Promise<unknown> = Promise.resolve()

export function useNotificationReplies(
  add: UseEntries['add'],
  status: UseEntries['status'],
  persistent: boolean,
) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!supportsCaptureNotification() || status !== 'ready') return
    if (!persistent) return
    let active = true
    let enabled = true
    const sync = () => {
      imports = imports.catch(() => undefined).then(async () => {
        if (!active || !enabled) return
        try {
          const result = await importNotificationEntries({
            drain: drainPendingCaptures,
            acknowledge: acknowledgePendingCaptures,
            release: releasePendingCaptures,
          }, add, () => active && enabled)
          if (!active || !enabled) return
          if (result.added > 0 || result.dropped > 0) {
            setMessage([
              result.added > 0 ? '补入 ' + result.added + ' 条通知记录' : '',
              result.dropped > 0 ? '待入库队列已满，已丢弃最旧 ' + result.dropped + ' 条' : '',
            ].filter(Boolean).join('；'))
          }
        } catch {
          if (active && enabled) setMessage('通知记录未全部入库，原记录已保留，下次打开重试')
        }
      })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    const statusListener = watchCaptureNotificationStatus((next) => {
      enabled = next.enabled
      if (next.enabled) sync()
      else if (active) setMessage(null)
    })
    const pendingListener = watchPendingCaptures(sync)
    void Promise.all([statusListener, pendingListener]).then(sync).catch(() => {
      if (active) setMessage('通知记录同步失败，请重新打开工作簿')
    })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      for (const listener of [statusListener, pendingListener]) {
        void listener.then((handle) => handle.remove()).catch(() => undefined)
      }
    }
  }, [add, status, persistent])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 8000)
    return () => window.clearTimeout(timer)
  }, [message])

  return message
}
