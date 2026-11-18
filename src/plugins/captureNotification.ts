import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface CaptureNotificationStatus {
  enabled: boolean
  permission: 'prompt' | 'granted' | 'denied'
}

export interface PendingCapture {
  id: string
  text: string
  createdAt: number
}

export interface PendingCaptures {
  entries: PendingCapture[]
  dropped: number
}

interface CaptureNotificationPlugin {
  getStatus(): Promise<CaptureNotificationStatus>
  setEnabled(options: { enabled: boolean }): Promise<CaptureNotificationStatus>
  openSettings(): Promise<void>
  drainPending(options: { owner: string }): Promise<PendingCaptures>
  acknowledgePending(options: { ids: string[]; owner: string }): Promise<void>
  releasePending(options: { owner: string }): Promise<void>
  addListener(
    event: 'statusChanged' | 'pendingChanged',
    listener: (status: CaptureNotificationStatus) => void,
  ): Promise<PluginListenerHandle>
}

const native = registerPlugin<CaptureNotificationPlugin>('CaptureNotification')
const replySession = 'webview-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)

export function supportsCaptureNotification(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function getCaptureNotificationStatus(): Promise<CaptureNotificationStatus> {
  return native.getStatus()
}

export function setCaptureNotificationEnabled(enabled: boolean): Promise<CaptureNotificationStatus> {
  return native.setEnabled({ enabled })
}

export function openCaptureNotificationSettings(): Promise<void> {
  return native.openSettings()
}

export function watchCaptureNotificationStatus(
  listener: (status: CaptureNotificationStatus) => void,
): Promise<PluginListenerHandle> {
  return native.addListener('statusChanged', listener)
}

export function drainPendingCaptures(): Promise<PendingCaptures> {
  return native.drainPending({ owner: replySession })
}

export function acknowledgePendingCaptures(ids: string[]): Promise<void> {
  return native.acknowledgePending({ ids, owner: replySession })
}

export function releasePendingCaptures(): Promise<void> {
  return native.releasePending({ owner: replySession })
}

export function watchPendingCaptures(listener: () => void): Promise<PluginListenerHandle> {
  return native.addListener('pendingChanged', listener)
}
