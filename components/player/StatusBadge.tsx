'use client'
import { TranscribeStatus } from '@/hooks/useTranscription'

interface StatusBadgeProps {
  status: TranscribeStatus
  errorMsg?: string
}

export function StatusBadge({ status, errorMsg }: StatusBadgeProps) {
  const configs: Record<
    TranscribeStatus,
    { dot: string; text: string; label: string; animate?: boolean }
  > = {
    idle: { dot: 'bg-gray-500', text: 'text-gray-400', label: '대기 중' },
    receiving: {
      dot: 'bg-green-500',
      text: 'text-green-400',
      label: '수신 중',
      animate: true,
    },
    transcribing: {
      dot: 'bg-blue-500',
      text: 'text-blue-400',
      label: 'AI 분석 중',
    },
    skipped: {
      dot: 'bg-yellow-500',
      text: 'text-yellow-400',
      label: '♪ 음악 감지 — 건너뜀',
    },
    error: {
      dot: 'bg-red-500',
      text: 'text-red-400',
      label: `오류${errorMsg ? ': ' + errorMsg : ''}`,
    },
  }

  const cfg = configs[status]

  return (
    <div className={`flex items-center gap-1.5 text-xs ${cfg.text}`}>
      <span
        className={`w-2 h-2 rounded-full ${cfg.dot} ${
          cfg.animate ? 'animate-pulse' : ''
        }`}
      />
      {cfg.label}
    </div>
  )
}
