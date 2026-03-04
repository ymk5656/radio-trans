'use client'
import { Search, Save } from 'lucide-react'

interface TranscriptSearchProps {
  value: string
  fontSize: number
  onChange: (v: string) => void
  onFontSizeChange: (size: number) => void
  onSave: () => void
}

export function TranscriptSearch({
  value,
  fontSize,
  onChange,
  onFontSizeChange,
  onSave,
}: TranscriptSearchProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#404040]">
      <div className="flex-1 flex items-center gap-1.5 bg-[#323232] rounded px-2 py-1">
        <Search size={12} className="text-[#707070]" />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search..."
          className="flex-1 bg-transparent text-xs text-[#f0f0f0] placeholder:text-[#707070] outline-none"
        />
      </div>
      <button
        title="Font size"
        onClick={() =>
          onFontSizeChange(fontSize >= 24 ? 14 : fontSize + 2)
        }
        className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors text-xs font-bold"
      >
        Aa
      </button>
      <button
        title="Save transcripts"
        onClick={onSave}
        className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors"
      >
        <Save size={13} />
      </button>
    </div>
  )
}
