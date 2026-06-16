'use client'
import { Mic, MicOff } from 'lucide-react'
import { TranscribeStatus } from '@/hooks/useTranscription'

interface TranscribeButtonProps {
  status: TranscribeStatus
  isActive: boolean
  disabled: boolean
  onClick: () => void
}

export function TranscribeButton({
  status,
  isActive,
  disabled,
  onClick,
}: TranscribeButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'iframe 채널은 전사 불가' : undefined}
      className={`
        flex items-center gap-1.5 px-5 py-2 rounded-full font-bold text-sm
        transition-all duration-200 active:scale-95
        ${disabled
          ? 'bg-[#2a2a2a] text-[#555] cursor-not-allowed border border-[#404040]'
          : isActive
          ? 'bg-green-500 text-black transcribe-active'
          : 'bg-green-500 hover:bg-green-400 text-black cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.4)]'
        }
      `}
    >
      {disabled ? (
        <MicOff size={14} />
      ) : (
        <Mic size={14} className={isActive ? 'animate-pulse' : ''} />
      )}
      {disabled ? '전사 불가' : isActive ? (
        <span className="flex items-center gap-1.5">
          전사 중
          <span className="flex gap-0.5">
            {[0, 150, 300].map(d => (
              <span
                key={d}
                className="inline-block w-0.5 h-3 bg-black/60 rounded-full origin-bottom"
                style={{ animation: `audio-bar 0.8s ease-in-out infinite`, animationDelay: `${d}ms` }}
              />
            ))}
          </span>
        </span>
      ) : (
        'TRANSCRIBE'
      )}
    </button>
  )
}
