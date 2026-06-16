'use client'
import { Radio, Menu } from 'lucide-react'

interface TitleBarProps {
  onMenuClick?: () => void
}

export function TitleBar({ onMenuClick }: TitleBarProps) {
  return (
    <div className="flex items-center h-10 px-4 bg-[#181818] border-b border-[#333] flex-shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden mr-3 text-[#707070] hover:text-[#f0f0f0] transition-colors active:scale-90"
        aria-label="메뉴 열기"
      >
        <Menu size={17} />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-green-500/15 border border-green-500/25 flex items-center justify-center">
          <Radio size={13} className="text-green-400" />
        </div>
        <span className="text-sm font-semibold text-[#e0e0e0] tracking-[-0.01em]">
          Radio Transcriber
        </span>
      </div>
    </div>
  )
}
