/**
 * 语音识别结果落到输入框：只追加，不覆盖人已经打的字。
 * 纯函数，Node 里可测；UI 只负责把结果传进来。
 */

/** 把一句识别结果接到草稿末尾，必要时补一个空格。 */
export function appendVoiceText(draft: string, spoken: string): string {
  const words = spoken.trim()
  if (!words) return draft
  if (!draft) return words
  // 草稿已有内容：末尾有空白就直接接，否则补一个空格，别把两个词粘在一起。
  return /\s$/u.test(draft) ? draft + words : draft + ' ' + words
}

/** 识别结果最长 500 字；超了截掉，避免一次塞爆输入框。 */
export const MAX_VOICE_CHARS = 500

export function clampVoiceText(spoken: string): string {
  const words = spoken.trim()
  return words.length > MAX_VOICE_CHARS ? words.slice(0, MAX_VOICE_CHARS) : words
}
