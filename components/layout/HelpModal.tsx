'use client'
import { useEffect } from 'react'
import { X, Radio, Mic, Globe, Clock, Maximize2, Download } from 'lucide-react'

interface HelpModalProps {
  onClose: () => void
}

// One-page usage guide for the app, opened from the bottom bar's help button.
export function HelpModal({ onClose }: HelpModalProps) {
  // Close on Escape — matches the rest of the app's modal behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[#262626] border border-[#3a3a3a] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-[#262626] border-b border-[#383838]">
          <h2 className="text-sm font-semibold text-[#f0f0f0] tracking-wide">사용 설명</h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-lg text-[#909090] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 text-[13px] leading-relaxed text-[#c4c4c4]">
          <p className="text-[#d8d8d8]">
            전 세계 라디오를 실시간으로 듣고, 흘러나오는 음성을 AI로 받아쓰고(전사) 한국어로
            번역해 자막처럼 보여주는 앱입니다.
          </p>

          <Section icon={<Radio size={14} />} title="시작하기">
            왼쪽 사이드바에서 채널을 고르면 자동으로 재생됩니다. 멈춰 있으면 ▶ 버튼으로 재생하세요.
            소리가 안 나오면 잠시 후 자동으로 다시 연결을 시도합니다.
          </Section>

          <Section icon={<Mic size={14} />} title="전사 시작">
            <span className="text-[#e0e0e0] font-medium">TRANSCRIBE</span> 버튼을 누르면 받아쓰기가
            시작되고, 오른쪽 전사 패널에 자막이 한 줄씩 흘러나옵니다. 다시 누르면 멈춥니다.
            말이 없는 구간은 자동으로 건너뛰어 불필요한 처리를 줄입니다.
          </Section>

          <Section icon={<Globe size={14} />} title="번역">
            전사 패널 상단의 <span className="text-blue-300/90 font-medium">번역</span> 버튼으로 한국어
            번역을 켜고 끌 수 있습니다. 원문이 먼저 뜨고, 번역은 곧이어 그 아래에 채워집니다.
          </Section>

          <Section icon={<Clock size={14} />} title="Sync Delay (싱크 조절)">
            전사에는 약간의 시간이 걸립니다. 이 슬라이더(0~5초)로 스피커 소리를 살짝 늦춰, 자막과
            음성이 같은 타이밍에 오도록 맞출 수 있습니다.
          </Section>

          <Section icon={<Maximize2 size={14} />} title="Focus Mode">
            전사 패널의 확대 아이콘을 누르면 자막만 크게 보는 집중 모드로 전환됩니다.
          </Section>

          <Section icon={<Download size={14} />} title="저장 & 내보내기">
            자막은 사용 중인 브라우저에 자동으로 저장되며(최근 500줄), 새로고침해도 유지됩니다.
            파일로 보관하려면 하단의 <span className="text-[#e0e0e0] font-medium">Export as TXT</span>로
            텍스트 파일을 내려받으세요.
          </Section>

          <p className="text-[12px] text-[#6f6f6f] pt-1 border-t border-[#333]">
            팁: 전사가 잠시 끊겨도 자동으로 재시도합니다. 무료 사용 한도를 초과하면 안내 메시지가
            뜨고, 한도가 초기화되면 다시 이어집니다.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 text-[#e8e8e8] font-semibold">
        <span className="text-green-500/80">{icon}</span>
        {title}
      </div>
      <p>{children}</p>
    </div>
  )
}
