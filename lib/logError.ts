export async function logError(route: string, error: unknown, brandName?: string, userHash?: string) {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://parrot-kappa-inky.vercel.app'
    await fetch(`${baseUrl}/api/log/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route, message, brandName, userHash }),
    })
  } catch {
    // Never throw from error logger
  }
}
