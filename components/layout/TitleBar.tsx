'use client'
import { Radio, Menu } from 'lucide-react'

interface TitleBarProps {
  onMenuClick?: () => void
}

export function TitleBar({ onMenuClick }: TitleBarProps) {
  return (
    <div className="flex items-center h-10 px-4 bg-[#1c1c1c] border-b border-[#404040] flex-shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden mr-3 text-[#909090] hover:text-[#f0f0f0] transition-colors"
        aria-label="메뉴 열기"
      >
        <Menu size={18} />
      </button>

      <Radio size={16} className="text-green-500 mr-2" />
      <span className="text-sm font-semibold text-[#f0f0f0] tracking-wide">
        Global Radio Transcriber
      </span>
    </div>
  )
}
