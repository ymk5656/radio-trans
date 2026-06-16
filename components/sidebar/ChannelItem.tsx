'use client'
import { GripVertical, Heart, X } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Channel } from '@/lib/channels'

interface ChannelItemProps {
  channel: Channel
  isActive: boolean
  editMode: boolean
  onSelect: (channel: Channel) => void
  onDelete: (channel: Channel) => void
}

export function ChannelItem({ channel, isActive, editMode, onSelect, onDelete }: ChannelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => !editMode && onSelect(channel)}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded mx-1
        transition-all duration-150 group
        ${editMode ? 'cursor-default' : 'cursor-pointer'}
        ${
          isActive && !editMode
            ? 'border-l-2 border-green-500 bg-green-500/[0.08] pl-1.5 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.1)]'
            : 'border-l-2 border-transparent hover:bg-white/[0.04]'
        }
      `}
    >
      {/* Icon */}
      {channel.group === 'Favorites' ? (
        <Heart
          size={14}
          className={isActive && !editMode ? 'text-green-500 fill-green-500' : 'text-green-500/80 fill-green-500/60'}
          fill="currentColor"
        />
      ) : (
        <div className="w-3.5 h-3.5 rounded-full border border-green-500/70 flex-shrink-0" />
      )}

      {/* Name + location */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs truncate ${
            isActive && !editMode ? 'text-green-400' : 'text-[#e8e8e8]'
          }`}
        >
          {channel.name}
        </div>
        <div className="text-[10px] text-[#909090] truncate">{channel.location}</div>
      </div>

      {/* Edit mode: delete button / Normal mode: drag handle */}
      {editMode ? (
        <button
          onClick={e => { e.stopPropagation(); onDelete(channel) }}
          className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/15 hover:bg-red-500/35 text-red-400/80 hover:text-red-300 flex items-center justify-center transition-all duration-150 active:scale-90"
          title="삭제"
        >
          <X size={10} />
        </button>
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="text-[#505050] hover:text-[#909090] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-all duration-150"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </button>
      )}
    </div>
  )
}
