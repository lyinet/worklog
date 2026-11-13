interface VoiceStatusProps {
  /** 录音中显示「在听…」；出错时显示可读错误；不可用时常驻提示。 */
  status: 'recording' | 'error' | 'idle'
  message?: string
  onDismiss?: () => void
}

/** 输入条上方的一行状态，不堆 toast、不遮挡输入框。 */
export function VoiceStatus({ status, message, onDismiss }: VoiceStatusProps) {
  if (status === 'idle' || !message) return null
  return (
    <div
      role={status === 'error' ? 'alert' : 'status'}
      className={[
        'mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-5',
        status === 'recording'
          ? 'border-[#3a2a2a] bg-[#1a1416] text-[#ff9b9b]'
          : 'border-[#5a2a2a] bg-[#1d1414] text-[#e8b4b4]',
      ].join(' ')}
    >
      {status === 'recording' && (
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6b6b] voice-recording"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1">{message}</span>
      {status === 'error' && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭提示"
          className="shrink-0 px-1 text-[#a87575] hover:text-[#e8b4b4]"
        >
          ×
        </button>
      )}
    </div>
  )
}
