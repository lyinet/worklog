import { describe, expect, it } from 'vitest'
import { appendVoiceText, clampVoiceText, MAX_VOICE_CHARS } from './voiceText'

describe('appendVoiceText', () => {
  it('空草稿直接用识别结果', () => {
    expect(appendVoiceText('', '开了个会')).toBe('开了个会')
  })

  it('已有内容追加到末尾，不覆盖', () => {
    expect(appendVoiceText('修了登录 bug', '顺便补了测试')).toBe('修了登录 bug 顺便补了测试')
  })

  it('末尾已有空白不再补空格', () => {
    expect(appendVoiceText('修了 bug ', '补测试')).toBe('修了 bug 补测试')
    expect(appendVoiceText('修了 bug\n', '补测试')).toBe('修了 bug\n补测试')
  })

  it('草稿带 #标签 时也照常追加', () => {
    expect(appendVoiceText('#前端 改了样式', '联调接口')).toBe('#前端 改了样式 联调接口')
  })

  it('识别结果首尾空白被去掉', () => {
    expect(appendVoiceText('草稿', '  说了一句  ')).toBe('草稿 说了一句')
  })

  it('空识别结果不动草稿', () => {
    expect(appendVoiceText('草稿', '')).toBe('草稿')
    expect(appendVoiceText('草稿', '   ')).toBe('草稿')
  })
})

describe('clampVoiceText', () => {
  it('短句原样', () => {
    expect(clampVoiceText('  一句话  ')).toBe('一句话')
  })

  it('超长截断到上限', () => {
    const long = '啊'.repeat(MAX_VOICE_CHARS + 30)
    expect(clampVoiceText(long)).toBe('啊'.repeat(MAX_VOICE_CHARS))
  })
})
