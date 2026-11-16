import { useEffect, useRef, useState } from 'react'
import type { CaptureNotificationStatus } from '../plugins/captureNotification'
import {
  getCaptureNotificationStatus,
  openCaptureNotificationSettings,
  setCaptureNotificationEnabled,
  supportsCaptureNotification,
  watchCaptureNotificationStatus,
} from '../plugins/captureNotification'

export function useCaptureNotification(open: boolean) {
  const supported = supportsCaptureNotification()
  const [status, setStatus] = useState<CaptureNotificationStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changing = useRef(false)

  useEffect(() => {
    if (!supported) return
    let active = true
    const accept = (next: CaptureNotificationStatus) => {
      if (active) {
        setStatus(next)
        setError(null)
      }
    }
    const listener = watchCaptureNotificationStatus(accept)
    void listener.catch(() => {
      if (active) setError('状态同步失败，请重新打开菜单')
    })
    void getCaptureNotificationStatus().then(accept).catch(() => {
      if (active) setError('通知状态读取失败，请重新打开菜单')
    })
    return () => {
      active = false
      void listener.then((handle) => handle.remove()).catch(() => undefined)
    }
  }, [supported, open])

  async function toggle() {
    if (!supported || !status || changing.current) return
    changing.current = true
    setBusy(true)
    setError(null)
    try {
      setStatus(await setCaptureNotificationEnabled(!status.enabled))
    } catch {
      setError('通知设置失败，请重试')
      try {
        setStatus(await getCaptureNotificationStatus())
      } catch {
        setError('通知设置失败，请重新打开菜单')
      }
    } finally {
      changing.current = false
      setBusy(false)
    }
  }

  async function openSettings() {
    setError(null)
    try {
      await openCaptureNotificationSettings()
    } catch {
      setError('请手动前往系统设置，允许工作簿通知')
    }
  }

  return { supported, status, busy, error, toggle, openSettings }
}
