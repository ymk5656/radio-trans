'use client'
import { Mic, MicOff, Globe } from 'lucide-react'
import { TranscribeStatus } from '@/hooks/useTranscription'

interface TranscribeButtonProps {
  status: TranscribeStatus
  isActive: boolean
  isTranslating: boolean
  disabled: boolean
  onClick: () => void
  onTranslateClick: () => void
}

export function TranscribeButton({
  status,
  isActive,
  isTranslating,
  disabled,
  onClick,
  onTranslateClick,
}: TranscribeButtonProps) {
  return (
    <div className="flex items-center gap-2">
      {/* TRANSCRIBE button */}
      <button
        onClick={onClick}
        disabled={disabled}
        title={disabled ? 'iframe 채널은 전사 불가' : undefined}
        className={`
          flex items-center gap-1.5 px-5 py-2 rounded-full font-bold text-sm transition-all
          ${disabled
            ? 'bg-[#323232] text-[#666] cursor-not-allowed border border-[#454545]'
            : isActive
            ? 'bg-green-500 text-black transcribe-active shadow-lg shadow-green-500/20'
            : 'bg-green-500 hover:bg-green-400 text-black cursor-pointer'
          }
        `}
      >
        {disabled ? (
          <MicOff size={14} />
        ) : (
          <Mic size={14} className={isActive ? 'animate-pulse' : ''} />
        )}
        {disabled ? '전사 불가' : isActive ? (
          <span className="flex items-center gap-1">전사 중 <span className="text-xs">(( • ))</span></span>
        ) : (
          'TRANSCRIBE'
        )}
      </button>

      {/* TRANSLATE toggle button */}
      <button
        onClick={onTranslateClick}
        disabled={disabled}
        title="한국어 번역 켜기/끄기"
        className={`
          flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border
          ${disabled
            ? 'text-[#555] border-[#383838] cursor-not-allowed'
            : isTranslating
            ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/30'
            : 'text-[#a0a0a0] border-[#505050] hover:border-blue-400/60 hover:text-blue-300 cursor-pointer'
          }
        `}
      >
        <Globe size={13} />
        번역
      </button>
    </div>
  )
}
