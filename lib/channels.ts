export type ChannelMode = 'stream' | 'iframe'
export type ChannelGroup = 'Favorites' | 'Korean FM' | string

export interface ChannelApiResolver {
  type: 'kbs' | 'mbc' | 'sbs'
  code?: string   // KBS channel code (21=1라디오, 23=3라디오, 24=클래식FM, 25=쿨FM)
  ch?: string     // MBC (sfm|mfm) / SBS (lovefm|powerfm)
}

export interface Channel {
  id: string
  name: string
  location: string
  group: ChannelGroup
  mode: ChannelMode
  streamUrl?: string        // direct mp3/m3u8 URL
  iframeUrl?: string        // iframe fallback URL (pure iframe channels only)
  apiResolver?: ChannelApiResolver  // resolve real stream URL via server API
  logo?: string
  isCustom?: boolean
  order?: number
}

export const DEFAULT_CHANNELS: Channel[] = [
  // ── Favorites ──────────────────────────────────
  {
    id: 'npr24',
    group: 'Favorites',
    name: 'NPR 24 Hour Program Stream',
    location: 'Washington DC, United States',
    mode: 'stream',
    streamUrl: 'https://npr-ice.streamguys1.com/live.mp3',
    order: 0,
  },
  {
    id: 'wfmu',
    group: 'Favorites',
    name: 'WFMU 91.1',
    location: 'Jersey City NJ, United States',
    mode: 'stream',
    streamUrl: 'https://stream0.wfmu.org/freeform-128k',
    order: 1,
  },
  {
    id: 'classicfm',
    group: 'Favorites',
    name: 'Classic FM',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://media-ice.musicradio.com/ClassicFMMP3',
    order: 2,
  },

  // ── Korean FM ──────────────────────────────────
  // apiResolver: server resolves actual HLS URL; all streamed through /api/hls proxy
  {
    id: 'kbs1',
    group: 'Korean FM',
    name: 'KBS 1라디오',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'kbs', code: '21' },
    logo: '/logos/kbs.png',
    order: 3,
  },
  {
    id: 'mbc-sfm',
    group: 'Korean FM',
    name: 'MBC 표준FM',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'mbc', ch: 'sfm' },
    logo: '/logos/mbc.png',
    order: 4,
  },
  {
    id: 'sbs-love',
    group: 'Korean FM',
    name: 'SBS 러브FM',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'sbs', ch: 'lovefm' },
    logo: '/logos/sbs.png',
    order: 5,
  },
  {
    id: 'ebs',
    group: 'Korean FM',
    name: 'EBS FM',
    location: 'Seoul, South Korea',
    mode: 'stream',
    streamUrl: 'https://ebsonair.ebs.co.kr/fmradiofamilypc/familypc1m/playlist.m3u8',
    logo: '/logos/ebs.png',
    order: 6,
  },
]

// ── Curated recommended channels for "Add Channel" modal ────────
export const RECOMMENDED_CHANNELS: Channel[] = [
  // BBC
  {
    id: 'bbc-ws',
    group: 'BBC',
    name: 'BBC World Service',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
  },
  {
    id: 'bbc-r4',
    group: 'BBC',
    name: 'BBC Radio 4',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_fourfm',
  },
  {
    id: 'bbc-r6',
    group: 'BBC',
    name: 'BBC Radio 6 Music',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_6music',
  },
  {
    id: 'bbc-r1',
    group: 'BBC',
    name: 'BBC Radio 1',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one',
  },
  // US Public Radio
  {
    id: 'wnyc-fm',
    group: 'US Public Radio',
    name: 'WNYC FM 93.9',
    location: 'New York NY, United States',
    mode: 'stream',
    streamUrl: 'https://fm939.wnyc.org/wnycfm.aac',
  },
  // Europe
  {
    id: 'france-inter',
    group: 'Europe',
    name: 'France Inter',
    location: 'Paris, France',
    mode: 'stream',
    streamUrl: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3',
  },
  {
    id: 'rfi-en',
    group: 'Europe',
    name: 'RFI English',
    location: 'Paris, France',
    mode: 'stream',
    streamUrl: 'https://rfienglish.streamguys1.com/rfi-128.mp3',
  },
  {
    id: 'swiss-jazz',
    group: 'Europe',
    name: 'Radio Swiss Jazz',
    location: 'Bern, Switzerland',
    mode: 'stream',
    streamUrl: 'https://stream.srg-ssr.ch/m/rsj/mp3_128',
  },
  {
    id: 'jazz-fm',
    group: 'Europe',
    name: 'Jazz FM',
    location: 'London, United Kingdom',
    mode: 'stream',
    streamUrl: 'https://media-ice.musicradio.com/JazzFMMP3',
  },
  // Music / Internet
  {
    id: 'soma-groove',
    group: 'Music',
    name: 'SomaFM: Groove Salad',
    location: 'San Francisco CA, United States',
    mode: 'stream',
    streamUrl: 'https://ice2.somafm.com/groovesalad-128-mp3',
  },
  {
    id: 'soma-drone',
    group: 'Music',
    name: 'SomaFM: Drone Zone',
    location: 'San Francisco CA, United States',
    mode: 'stream',
    streamUrl: 'https://ice2.somafm.com/dronezone-128-mp3',
  },
  {
    id: 'soma-lush',
    group: 'Music',
    name: 'SomaFM: Lush',
    location: 'San Francisco CA, United States',
    mode: 'stream',
    streamUrl: 'https://ice2.somafm.com/lush-128-mp3',
  },
  // Korean FM extras
  {
    id: 'kbs-classic',
    group: 'Korean FM',
    name: 'KBS 클래식FM',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'kbs', code: '24' },
    logo: '/logos/kbs.png',
  },
  {
    id: 'kbs-coolfm',
    group: 'Korean FM',
    name: 'KBS 쿨FM (2FM)',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'kbs', code: '25' },
    logo: '/logos/kbs.png',
  },
  {
    id: 'mbc-fm4u',
    group: 'Korean FM',
    name: 'MBC FM4U',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'mbc', ch: 'mfm' },
    logo: '/logos/mbc.png',
  },
  {
    id: 'sbs-power',
    group: 'Korean FM',
    name: 'SBS 파워FM',
    location: 'Seoul, South Korea',
    mode: 'stream',
    apiResolver: { type: 'sbs', ch: 'powerfm' },
    logo: '/logos/sbs.png',
  },
]

export const CHANNEL_GROUPS: ChannelGroup[] = ['Favorites', 'Korean FM']

export const ALL_RECOMMENDED_CHANNELS: Channel[] = [
  ...DEFAULT_CHANNELS,
  ...RECOMMENDED_CHANNELS,
]
