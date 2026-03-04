import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Global Radio Transcriber',
  description: 'Real-time radio transcription with Whisper AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.className} bg-[#141414] text-[#f5f5f5] overflow-hidden`}>
        {children}
      </body>
    </html>
  )
}
