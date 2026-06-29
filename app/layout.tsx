import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Candor — assumption intelligence',
  description: 'Are your roadmap assumptions still valid, or is the market already signalling failure?',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}