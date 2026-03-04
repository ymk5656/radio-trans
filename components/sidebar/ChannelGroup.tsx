'use client'
import { Pencil, Check } from 'lucide-react'

interface ChannelGroupProps {
  name: string
  editMode?: boolean
  onToggleEdit?: () => void
}

export function ChannelGroupHeader({ name, editMode, onToggleEdit }: ChannelGroupProps) {
  return (
    <div className="px-3 pt-3 pb-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#909090] uppercase tracking-widest font-semibold">
          {name}
        </span>
        {onToggleEdit && (
          <button
            onClick={onToggleEdit}
            className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              editMode
                ? 'text-green-400 bg-green-500/15 hover:bg-green-500/25'
                : 'text-[#707070] hover:text-[#b0b0b0]'
            }`}
          >
            {editMode ? <Check size={9} /> : <Pencil size={9} />}
            {editMode ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      <div className="mt-1 border-b border-[#404040]" />
    </div>
  )
}
