import { useCaptureNotification } from '../state/useCaptureNotification'

export function CaptureNotificationSetting({ open }: { open: boolean }) {
  const { supported, status, busy, error, toggle, openSettings } = useCaptureNotification(open)
  const denied = status?.enabled && status.permission !== 'granted'

  return (
    <div className="rounded-xl border border-[#232326] px-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={status?.enabled ?? false}
        aria-label="通知栏快捷记录"
        aria-describedby="capture-notification-hint"
        disabled={!supported || !status || busy}
        onClick={() => void toggle()}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-[15px] text-[#e6e6e8] disabled:opacity-50"
      >
        <span>通知栏快捷记录</span>
        <span className={status?.enabled ? 'shrink-0 text-[13px] text-[#7ee2a8]' : 'shrink-0 text-[13px] text-[#8b8b90]'}>
          {busy ? '设置中…' : status?.enabled ? '已开启' : '已关闭'}
        </span>
      </button>
      <p id="capture-notification-hint" role={denied || error ? 'status' : undefined} className="text-[12px] leading-5 text-[#8b8b90]">
        {error ?? (!supported ? '仅安卓版可用' : denied ? '通知未获允许，请到系统设置开启' : '下拉通知栏，点一下记一笔；不响不震')}
      </p>
      {supported && denied && (
        <button
          type="button"
          onClick={() => void openSettings()}
          className="mt-1 min-h-10 text-[13px] text-[#7ee2a8]"
        >
          去系统设置
        </button>
      )}
    </div>
  )
}
