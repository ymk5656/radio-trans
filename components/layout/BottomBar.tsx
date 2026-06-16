'use client'
import {
  Save,
  LayoutGrid,
  Sliders,
  RefreshCw,
  FolderOpen,
  Settings,
  HelpCircle,
  FileText,
} from 'lucide-react'
import { TranscriptEntry, exportTranscriptsAsTxt } from '@/lib/storage'

interface BottomBarProps {
  transcripts: TranscriptEntry[]
  skippedCount: number
  onRefresh?: () => void
  onSave?: () => void
}

export function BottomBar({
  transcripts,
  skippedCount,
  onRefresh,
  onSave,
}: BottomBarProps) {
  const iconBtn =
    'p-1.5 rounded-lg text-[#707070] hover:text-[#e0e0e0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90'

  return (
    <div className="flex items-center justify-between h-9 px-3 bg-[#181818] border-t border-[#333] flex-shrink-0">
      <div className="flex items-center gap-1">
        <button className={iconBtn} title="Save" onClick={onSave}>
          <Save size={14} />
        </button>
        <button className={iconBtn} title="Layout">
          <LayoutGrid size={14} />
        </button>
        <button className={iconBtn} title="VAD Settings">
          <Sliders size={14} />
        </button>
        <button className={iconBtn} title="Refresh" onClick={onRefresh}>
          <RefreshCw size={14} />
        </button>

        {skippedCount > 0 && (
          <span className="ml-2 text-xs text-yellow-400 flex items-center gap-1">
            🎵 {skippedCount}회 건너뜀
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button className={iconBtn} title="Open">
          <FolderOpen size={14} />
        </button>
        <button className={iconBtn} title="Settings">
          <Settings size={14} />
        </button>
        <button className={iconBtn} title="Help">
          <HelpCircle size={14} />
        </button>
        <button className={iconBtn} title="Export">
          <FileText size={14} />
        </button>
        <button
          onClick={() => exportTranscriptsAsTxt(transcripts)}
          className="ml-1 px-3 py-1 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-[#d0d0d0] rounded-lg border border-white/[0.08] transition-all duration-150 active:scale-95"
          title="Export as TXT"
        >
          Export as TXT
        </button>
      </div>
    </div>
  )
}
