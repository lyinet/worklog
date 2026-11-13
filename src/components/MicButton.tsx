interface MicButtonProps {
  recording: boolean
  disabled: boolean
  onClick: () => void
}

/** 方形图标按钮，和「记下」并排，不挤压输入框宽度。 */
export function MicButton({ recording, disabled, onClick }: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? '停止录音' : '语音输入'}
      aria-pressed={recording}
      className={[
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition',
        'disabled:opacity-30',
        recording
          ? 'voice-recording border-[#ff6b6b] bg-[#2a1416] text-[#ff6b6b]'
          : 'border-[#2a2a2e] bg-[#17171a] text-[#9a9aa2] enabled:hover:border-[#3a3a40] enabled:hover:text-[#ededed]',
      ].join(' ')}
    >
      {recording ? (
        // 波形：四根条，纯 CSS 动画
        <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
          {['voice-bar', 'voice-bar voice-bar-2', 'voice-bar voice-bar-3', 'voice-bar voice-bar-4'].map(
            (cls) => (
              <span key={cls} className={`h-4 w-[3px] rounded-full bg-current ${cls}`} />
            ),
          )}
        </span>
      ) : (
        // 麦克风图标：内联 SVG，不引图标库
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 17v4M8 21h8" />
        </svg>
      )}
    </button>
  )
}
