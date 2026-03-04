'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Channel } from '@/lib/channels'
import { ChannelGroupHeader } from './ChannelGroup'
import { ChannelItem } from './ChannelItem'
import { AddChannelModal } from './AddChannelModal'

interface SidebarProps {
  channels: Channel[]
  activeChannel: Channel | null
  onSelect: (channel: Channel) => void
  onReorder: (channels: Channel[]) => void
  onAddChannel: (channel: Channel) => void
  onRemoveChannel: (channel: Channel) => void
}

export function Sidebar({
  channels,
  activeChannel,
  onSelect,
  onReorder,
  onAddChannel,
  onRemoveChannel,
}: SidebarProps) {
  const [showModal, setShowModal] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = channels.findIndex(c => c.id === active.id)
    const newIdx = channels.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(channels, oldIdx, newIdx).map((c, i) => ({
      ...c,
      order: i,
    }))
    onReorder(reordered)
  }

  const groups = Array.from(new Set(channels.map(c => c.group)))

  return (
    <div className="w-[220px] flex-shrink-0 bg-[#262626] border-r border-[#404040] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={channels.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {groups.map((group, idx) => (
              <div key={group}>
                <ChannelGroupHeader
                  name={group}
                  editMode={editMode}
                  onToggleEdit={idx === 0 ? () => setEditMode(e => !e) : undefined}
                />
                {channels
                  .filter(c => c.group === group)
                  .map(channel => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={activeChannel?.id === channel.id}
                      editMode={editMode}
                      onSelect={onSelect}
                      onDelete={onRemoveChannel}
                    />
                  ))}
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#404040]">
        <button
          onClick={() => { setEditMode(false); setShowModal(true) }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-[#b0b0b0] hover:text-green-400 hover:bg-green-950/20 rounded border border-dashed border-[#505050] hover:border-green-500/50 transition-all"
        >
          <Plus size={12} />
          Add Channel
        </button>
      </div>

      {showModal && (
        <AddChannelModal
          existingIds={new Set(channels.map(c => c.id))}
          onClose={() => setShowModal(false)}
          onAdd={onAddChannel}
        />
      )}
    </div>
  )
}
