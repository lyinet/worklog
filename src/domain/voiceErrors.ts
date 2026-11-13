/**
 * 语音识别失败的分类与中文文案。纯逻辑，不碰 DOM，Node 里可测。
 * 原生插件和浏览器 Web Speech 抛出来的错误字符串都先归一到这里，
 * UI 只认 VoiceFailure，不认具体实现的错误格式。
 */

export type VoicePlatform = 'android' | 'web'

export type VoiceErrorCode =
  | 'permission'
  | 'unsupported'
  | 'no-speech'
  | 'no-match'
  | 'network'
  | 'audio'
  | 'busy'
  | 'aborted'
  | 'unknown'

export interface VoiceFailure {
  code: VoiceErrorCode
  detail?: string
}

const CODES: readonly VoiceErrorCode[] = [
  'permission',
  'unsupported',
  'no-speech',
  'no-match',
  'network',
  'audio',
  'busy',
  'aborted',
  'unknown',
]

/** 把任意抛出来的东西（Error / CapacitorException / 普通对象）收成 VoiceFailure。 */
export function asVoiceFailure(value: unknown): VoiceFailure {
  if (value && typeof value === 'object') {
    const record = value as { code?: unknown; detail?: unknown; message?: unknown }
    if (typeof record.code === 'string' && CODES.includes(record.code as VoiceErrorCode)) {
      return {
        code: record.code as VoiceErrorCode,
        ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
      }
    }
    const message = String(record.message ?? '')
    return { code: classifyNativeError(message).code, detail: message.slice(0, 80) || undefined }
  }
  const message = String(value ?? '')
  return { code: classifyNativeError(message).code, detail: message.slice(0, 80) || undefined }
}

/** 人能看懂的一句话；'aborted' 不算失败，返回空串。 */
export function voiceMessage(failure: VoiceFailure, platform: VoicePlatform): string {
  switch (failure.code) {
    case 'aborted':
      return ''
    case 'permission':
      return platform === 'android'
        ? '没拿到麦克风权限。去系统设置 → 应用 → 工作簿 → 权限，打开麦克风再试。'
        : '浏览器没给麦克风权限。点地址栏的锁图标放行，再试一次。'
    case 'unsupported':
      return platform === 'android'
        ? '这台设备没有可用的语音识别服务。'
        : '这个浏览器不支持语音输入，换 Chrome 试试。'
    case 'no-speech':
      return '没听到声音，靠近麦克风再说一遍。'
    case 'no-match':
      return '没识别出来，说清楚一点再试。'
    case 'network':
      return '网络不给力，语音识别要联网。检查网络再试。'
    case 'audio':
      return '录音出错了，再试一次。'
    case 'busy':
      return '语音识别正忙，稍等一下再试。'
    case 'unknown':
      return failure.detail ? `语音识别失败：${failure.detail}` : '语音识别失败，再试一次。'
  }
}

/** @capacitor-community/speech-recognition 的 getErrorText() / reject() 原始文案。 */
export function classifyNativeError(raw: string): VoiceFailure {
  const s = raw.toLowerCase()
  if (s.includes('permission') || s.includes('insufficient')) return { code: 'permission' }
  if (s.includes('not available') || s.includes('unavailable')) return { code: 'unsupported' }
  if (s.includes('no speech') || s.includes('speech timeout')) return { code: 'no-speech' }
  if (s.includes('no match') || s.includes("didn't understand") || s.includes('did not understand')) {
    return { code: 'no-match' }
  }
  if (s.includes('network') || s.includes('timeout')) return { code: 'network' }
  if (s.includes('audio') || s.includes('client side') || s.includes('server')) return { code: 'audio' }
  if (s.includes('busy')) return { code: 'busy' }
  return { code: 'unknown', detail: raw.slice(0, 80) || undefined }
}

/** 浏览器 SpeechRecognitionErrorEvent.error。 */
export function classifyWebError(raw: string): VoiceFailure {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return { code: 'permission' }
    case 'no-speech':
      return { code: 'no-speech' }
    case 'network':
      return { code: 'network' }
    case 'audio-capture':
      return { code: 'audio' }
    case 'aborted':
      return { code: 'aborted' }
    case 'language-not-supported':
      return { code: 'unsupported' }
    case 'bad-grammar':
      return { code: 'no-match' }
    default:
      return { code: 'unknown', detail: raw.slice(0, 80) || undefined }
  }
}
