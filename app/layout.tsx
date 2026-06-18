import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parrot — competitive intelligence',
  description: 'See what your competitors are doing before you notice it yourself.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
