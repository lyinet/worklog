import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureNotificationStatus } from '../plugins/captureNotification'

const state = vi.hoisted(() => ({ useCaptureNotification: vi.fn() }))
vi.mock('../state/useCaptureNotification', () => state)

import { CaptureNotificationSetting } from './CaptureNotificationSetting'

function render(options: {
  supported?: boolean
  status?: CaptureNotificationStatus | null
  busy?: boolean
  error?: string | null
} = {}) {
  state.useCaptureNotification.mockReturnValue({
    supported: true,
    status: { enabled: false, permission: 'granted' },
    busy: false,
    error: null,
    toggle: vi.fn(),
    openSettings: vi.fn(),
    ...options,
  })
  return renderToStaticMarkup(createElement(CaptureNotificationSetting, { open: true }))
}

beforeEach(() => vi.clearAllMocks())

describe('通知开关文案', () => {
  it('默认关闭，并说明不响不震', () => {
    const html = render()
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('已关闭')
    expect(html).toContain('不响不震')
  })

  it('已开启且授权时不增加设置步骤', () => {
    const html = render({ status: { enabled: true, permission: 'granted' } })
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('已开启')
    expect(html).not.toContain('去系统设置')
  })

  it('拒绝权限保留开关意愿，给一行中文及设置入口', () => {
    const html = render({ status: { enabled: true, permission: 'denied' } })
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('通知未获允许，请到系统设置开启')
    expect(html).toContain('去系统设置')
    expect(html).toContain('role="status"')
  })

  it('关闭后不再要求用户去设置', () => {
    const html = render({ status: { enabled: false, permission: 'denied' } })
    expect(html).not.toContain('去系统设置')
  })

  it('权限申请期间禁用开关，避免连续点击', () => {
    const html = render({ busy: true })
    expect(html).toContain('disabled=""')
    expect(html).toContain('设置中…')
  })

  it('尚未读取原生状态时禁用开关', () => {
    expect(render({ status: null })).toContain('disabled=""')
  })

  it('网页版不提供无效开关', () => {
    const html = render({ supported: false, status: null })
    expect(html).toContain('仅安卓版可用')
    expect(html).toContain('disabled=""')
  })

  it('原生失败时显示中文重试提示', () => {
    expect(render({ error: '通知设置失败，请重试' })).toContain('通知设置失败，请重试')
  })
})
