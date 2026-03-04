'use client'
import { useState, useMemo } from 'react'
import { X, Plus, Search, Check, ChevronRight } from 'lucide-react'
import { Channel, ChannelMode, ALL_RECOMMENDED_CHANNELS } from '@/lib/channels'

interface AddChannelModalProps {
  existingIds: Set<string>
  onClose: () => void
  onAdd: (channel: Channel) => void
}

type Tab = 'recommended' | 'custom'

const GROUP_ORDER = ['Favorites', 'Korean FM', 'BBC', 'US Public Radio', 'Europe', 'Music']

export function AddChannelModal({ existingIds, onClose, onAdd }: AddChannelModalProps) {
  const [tab, setTab] = useState<Tab>('recommended')
  const [search, setSearch] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Custom form state
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [mode, setMode] = useState<ChannelMode>('stream')
  const [streamUrl, setStreamUrl] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [group, setGroup] = useState('Favorites')

  const available = useMemo(() => {
    return ALL_RECOMMENDED_CHANNELS.filter(
      ch => !existingIds.has(ch.id) && !added.has(ch.id)
    )
  }, [existingIds, added])

  const filtered = useMemo(() => {
    if (!search.trim()) return available
    const q = search.toLowerCase()
    return available.filter(
      ch =>
        ch.name.toLowerCase().includes(q) ||
        ch.location.toLowerCase().includes(q) ||
        ch.group.toLowerCase().includes(q)
    )
  }, [available, search])

  // Group filtered results
  const grouped = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const ch of filtered) {
      if (!map.has(ch.group)) map.set(ch.group, [])
      map.get(ch.group)!.push(ch)
    }
    // Sort groups by GROUP_ORDER
    return GROUP_ORDER.filter(g => map.has(g)).map(g => ({
      group: g,
      channels: map.get(g)!,
    }))
  }, [filtered])

  const handleAdd = (ch: Channel) => {
    onAdd({ ...ch, group: ch.group })
    setAdded(prev => { const next = new Set(Array.from(prev)); next.add(ch.id); return next })
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const channel: Channel = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      location: location.trim() || 'Unknown',
      group,
      mode,
      streamUrl: mode === 'stream' ? streamUrl.trim() : undefined,
      iframeUrl: mode === 'iframe' ? iframeUrl.trim() : undefined,
      isCustom: true,
    }
    onAdd(channel)
    onClose()
  }

  const inputCls =
    'w-full bg-[#323232] border border-[#505050] rounded px-2 py-1.5 text-sm text-[#f0f0f0] placeholder:text-[#707070] focus:outline-none focus:border-green-500/70'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#262626] border border-[#404040] rounded-xl w-[460px] max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#404040]">
          <h3 className="text-sm font-semibold text-[#f0f0f0]">채널 추가</h3>
          <button onClick={onClose} className="text-[#909090] hover:text-[#f0f0f0]">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#404040]">
          {(['recommended', 'custom'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t
                  ? 'text-green-400 border-b-2 border-green-500'
                  : 'text-[#909090] hover:text-[#f0f0f0]'
              }`}
            >
              {t === 'recommended' ? '추천 채널' : '직접 추가'}
            </button>
          ))}
        </div>

        {tab === 'recommended' ? (
          <>
            {/* Search */}
            <div className="px-3 py-2 border-b border-[#3a3a3a]">
              <div className="flex items-center gap-2 bg-[#323232] rounded px-2 py-1.5">
                <Search size={13} className="text-[#707070] flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="채널명, 장르, 국가 검색..."
                  className="flex-1 bg-transparent text-xs text-[#f0f0f0] placeholder:text-[#707070] outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto py-1">
              {grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#606060] text-xs gap-2">
                  <div className="text-2xl">🔍</div>
                  {available.length === 0
                    ? '모든 추천 채널이 이미 추가됐습니다'
                    : '검색 결과 없음'}
                </div>
              ) : (
                grouped.map(({ group, channels }) => (
                  <div key={group}>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[10px] text-[#707070] uppercase tracking-widest font-semibold">
                        {group}
                      </span>
                    </div>
                    {channels.map(ch => (
                      <RecommendedChannelRow
                        key={ch.id}
                        channel={ch}
                        onAdd={handleAdd}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[#404040]">
              <span className="text-[10px] text-[#606060]">
                {available.length}개 채널 이용 가능
              </span>
            </div>
          </>
        ) : (
          /* Custom form */
          <div className="flex-1 overflow-y-auto p-4">
            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-[#b0b0b0] mb-1 block">채널명 *</label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="예: BBC World Service"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#b0b0b0] mb-1 block">위치</label>
                <input
                  className={inputCls}
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="예: London, UK"
                />
              </div>
              <div>
                <label className="text-xs text-[#b0b0b0] mb-1 block">그룹</label>
                <select
                  className={inputCls}
                  value={group}
                  onChange={e => setGroup(e.target.value)}
                >
                  <option value="Favorites">Favorites</option>
                  <option value="Korean FM">Korean FM</option>
                  <option value="BBC">BBC</option>
                  <option value="US Public Radio">US Public Radio</option>
                  <option value="Europe">Europe</option>
                  <option value="Music">Music</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#b0b0b0] mb-1 block">방식 *</label>
                <div className="flex gap-2">
                  {(['stream', 'iframe'] as ChannelMode[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                        mode === m
                          ? 'bg-green-500/20 border-green-500/60 text-green-400'
                          : 'bg-[#323232] border-[#505050] text-[#b0b0b0]'
                      }`}
                    >
                      {m === 'stream' ? 'Stream (MP3/HLS)' : 'iFrame 임베드'}
                    </button>
                  ))}
                </div>
              </div>
              {mode === 'stream' ? (
                <div>
                  <label className="text-xs text-[#b0b0b0] mb-1 block">스트림 URL *</label>
                  <input
                    className={inputCls}
                    value={streamUrl}
                    onChange={e => setStreamUrl(e.target.value)}
                    placeholder="https://..."
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-[#b0b0b0] mb-1 block">iFrame URL *</label>
                  <input
                    className={inputCls}
                    value={iframeUrl}
                    onChange={e => setIframeUrl(e.target.value)}
                    placeholder="https://..."
                    required
                  />
                  <p className="text-[10px] text-yellow-400/80 mt-1">
                    ⚠ iFrame 채널은 전사가 불가합니다
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-1.5 text-xs rounded border border-[#505050] text-[#b0b0b0] hover:text-[#f0f0f0] transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 text-xs rounded bg-green-500 hover:bg-green-400 text-black font-bold transition-colors"
                >
                  추가
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function RecommendedChannelRow({
  channel,
  onAdd,
}: {
  channel: Channel
  onAdd: (ch: Channel) => void
}) {
  const [justAdded, setJustAdded] = useState(false)

  const handle = () => {
    onAdd(channel)
    setJustAdded(true)
  }

  const isKorean = !!channel.apiResolver
  const isIframe = channel.mode === 'iframe'

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-[#2e2e2e] transition-colors group">
      {/* Logo placeholder */}
      {channel.logo ? (
        <div className="w-7 h-7 rounded-full bg-[#404040] flex items-center justify-center overflow-hidden flex-shrink-0">
          <span className="text-[10px] font-bold text-[#b0b0b0]">
            {channel.name.slice(0, 2)}
          </span>
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-[#363636] flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-[#888]">
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#e8e8e8] truncate">{channel.name}</div>
        <div className="text-[10px] text-[#707070] truncate flex items-center gap-1.5">
          <span>{channel.location}</span>
          {isIframe && (
            <span className="text-yellow-600 text-[9px]">iFrame</span>
          )}
          {isKorean && !isIframe && (
            <span className="text-green-600 text-[9px]">HLS</span>
          )}
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={handle}
        disabled={justAdded}
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
          justAdded
            ? 'bg-green-500/20 text-green-400'
            : 'bg-[#404040] text-[#909090] hover:bg-green-500 hover:text-black opacity-0 group-hover:opacity-100'
        }`}
        title="추가"
      >
        {justAdded ? <Check size={11} /> : <Plus size={11} />}
      </button>
    </div>
  )
}
