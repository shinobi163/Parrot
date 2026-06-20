import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parrot — market signal',
  description: 'See what the market thinks about any brand before you make your next move.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
