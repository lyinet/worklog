import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureNotificationStatus } from './captureNotification'

const bridge = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  openSettings: vi.fn(),
  addListener: vi.fn(),
  drainPending: vi.fn(),
  acknowledgePending: vi.fn(),
  releasePending: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: bridge.getPlatform },
  registerPlugin: (name: string) => {
    if (name !== 'CaptureNotification') throw new Error('插件名错误')
    return bridge
  },
}))

import {
  acknowledgePendingCaptures,
  drainPendingCaptures,
  getCaptureNotificationStatus,
  openCaptureNotificationSettings,
  setCaptureNotificationEnabled,
  releasePendingCaptures,
  supportsCaptureNotification,
  watchCaptureNotificationStatus,
  watchPendingCaptures,
} from './captureNotification'

beforeEach(() => vi.clearAllMocks())

describe('通知原生桥', () => {
  it('读取通知队列并将落库确认与释放操作透传给原生', async () => {
    const batch = { entries: [], dropped: 0 }
    bridge.drainPending.mockResolvedValue(batch)
    expect(await drainPendingCaptures()).toEqual(batch)
    await acknowledgePendingCaptures(['notification-id'])
    expect(bridge.acknowledgePending).toHaveBeenCalledWith({
      ids: ['notification-id'], owner: expect.stringMatching(/^webview-/),
    })
    expect(bridge.drainPending).toHaveBeenCalledWith({ owner: expect.stringMatching(/^webview-/) })
    await releasePendingCaptures()
    expect(bridge.releasePending).toHaveBeenCalledOnce()
    expect(bridge.releasePending).toHaveBeenCalledWith({ owner: expect.stringMatching(/^webview-/) })
  })

  it('监听前台时收到的新回复', async () => {
    bridge.addListener.mockResolvedValue({ remove: vi.fn() })
    const listener = vi.fn()
    await watchPendingCaptures(listener)
    expect(bridge.addListener).toHaveBeenCalledWith('pendingChanged', listener)
  })
  it('只在 Android 提供开关，不把 PWA 当作常驻通知', () => {
    bridge.getPlatform.mockReturnValue('android')
    expect(supportsCaptureNotification()).toBe(true)
    bridge.getPlatform.mockReturnValue('web')
    expect(supportsCaptureNotification()).toBe(false)
    bridge.getPlatform.mockReturnValue('ios')
    expect(supportsCaptureNotification()).toBe(false)
  })

  it('读取持久化状态，不申请权限', async () => {
    const status: CaptureNotificationStatus = { enabled: true, permission: 'denied' }
    bridge.getStatus.mockResolvedValue(status)
    expect(await getCaptureNotificationStatus()).toEqual(status)
    expect(bridge.setEnabled).not.toHaveBeenCalled()
  })

  it('开启与关闭透传给原生，拒权保留开启意愿', async () => {
    bridge.setEnabled.mockResolvedValue({ enabled: true, permission: 'denied' })
    expect(await setCaptureNotificationEnabled(true)).toEqual({ enabled: true, permission: 'denied' })
    expect(bridge.setEnabled).toHaveBeenLastCalledWith({ enabled: true })
    await setCaptureNotificationEnabled(false)
    expect(bridge.setEnabled).toHaveBeenLastCalledWith({ enabled: false })
  })

  it('显式点击后才跳到系统设置', async () => {
    await openCaptureNotificationSettings()
    expect(bridge.openSettings).toHaveBeenCalledOnce()
  })

  it('监听返回前台的权限变化，并保留清理句柄', async () => {
    const remove = vi.fn()
    bridge.addListener.mockResolvedValue({ remove })
    const listener = vi.fn()
    const handle = await watchCaptureNotificationStatus(listener)
    expect(bridge.addListener).toHaveBeenCalledWith('statusChanged', listener)
    await handle.remove()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('桥接失败交给 UI 提示，不伪报成功', async () => {
    bridge.setEnabled.mockRejectedValue(new Error('bridge failure'))
    await expect(setCaptureNotificationEnabled(true)).rejects.toThrow('bridge failure')
  })
})
