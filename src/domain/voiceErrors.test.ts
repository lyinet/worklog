import { describe, expect, it } from 'vitest'
import {
  asVoiceFailure,
  classifyNativeError,
  classifyWebError,
  voiceMessage,
} from './voiceErrors'

describe('classifyNativeError', () => {
  it('缺权限', () => {
    expect(classifyNativeError('Missing permission').code).toBe('permission')
    expect(classifyNativeError('Insufficient permissions').code).toBe('permission')
  })

  it('设备没有识别服务', () => {
    expect(classifyNativeError('Speech recognition service is not available.').code).toBe('unsupported')
  })

  it('没听到 / 没识别到', () => {
    expect(classifyNativeError('No speech input').code).toBe('no-speech')
    expect(classifyNativeError('No match').code).toBe('no-match')
    expect(classifyNativeError("Didn't understand, please try again.").code).toBe('no-match')
  })

  it('网络问题', () => {
    expect(classifyNativeError('Network error').code).toBe('network')
    expect(classifyNativeError('Network timeout').code).toBe('network')
  })

  it('录音出错 / 忙', () => {
    expect(classifyNativeError('Audio recording error').code).toBe('audio')
    expect(classifyNativeError('RecognitionService busy').code).toBe('busy')
  })

  it('未知错误保留原始信息', () => {
    expect(classifyNativeError('Something broke')).toEqual({
      code: 'unknown',
      detail: 'Something broke',
    })
  })
})

describe('classifyWebError', () => {
  it('浏览器错误码映射到同一套分类', () => {
    expect(classifyWebError('not-allowed').code).toBe('permission')
    expect(classifyWebError('no-speech').code).toBe('no-speech')
    expect(classifyWebError('network').code).toBe('network')
    expect(classifyWebError('audio-capture').code).toBe('audio')
    expect(classifyWebError('aborted').code).toBe('aborted')
    expect(classifyWebError('weird-new-code').code).toBe('unknown')
  })
})

describe('asVoiceFailure', () => {
  it('识别 ValueError 对象', () => {
    expect(asVoiceFailure(new Error('Network error'))).toMatchObject({ code: 'network' })
  })

  it('识别已经是 VoiceFailure 的对象', () => {
    expect(asVoiceFailure({ code: 'permission', detail: 'x' })).toEqual({
      code: 'permission',
      detail: 'x',
    })
  })

  it('字符串与 null 也不炸', () => {
    expect(asVoiceFailure('No match').code).toBe('no-match')
    expect(asVoiceFailure(null).code).toBe('unknown')
  })
})

describe('voiceMessage', () => {
  it('安卓没权限时引导去系统设置', () => {
    expect(voiceMessage({ code: 'permission' }, 'android')).toContain('系统设置')
    expect(voiceMessage({ code: 'permission' }, 'android')).toContain('麦克风')
  })

  it('浏览器没权限时给另一套文案', () => {
    expect(voiceMessage({ code: 'permission' }, 'web')).toContain('锁图标')
  })

  it('各类失败都有可读文案', () => {
    for (const code of ['unsupported', 'no-speech', 'no-match', 'network', 'audio', 'busy', 'unknown'] as const) {
      expect(voiceMessage({ code }, 'android').length).toBeGreaterThan(0)
      expect(voiceMessage({ code }, 'web').length).toBeGreaterThan(0)
    }
  })

  it('主动取消不算失败', () => {
    expect(voiceMessage({ code: 'aborted' }, 'android')).toBe('')
  })
})
