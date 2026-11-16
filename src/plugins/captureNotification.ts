import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface CaptureNotificationStatus {
  enabled: boolean
  permission: 'prompt' | 'granted' | 'denied'
}

interface CaptureNotificationPlugin {
  getStatus(): Promise<CaptureNotificationStatus>
  setEnabled(options: { enabled: boolean }): Promise<CaptureNotificationStatus>
  openSettings(): Promise<void>
  addListener(
    event: 'statusChanged',
    listener: (status: CaptureNotificationStatus) => void,
  ): Promise<PluginListenerHandle>
}

const native = registerPlugin<CaptureNotificationPlugin>('CaptureNotification')

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
