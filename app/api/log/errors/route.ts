import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { route, message, brandName, userHash } = await req.json()

    await fetch(`${SUPABASE_URL}/rest/v1/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        route: route || 'unknown',
        message: message || 'unknown error',
        brand_name: brandName || null,
        user_hash: userHash || null,
      }),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    // Silent fail — error logging should never break anything
    console.error('Error logger failed:', err)
    return NextResponse.json({ success: false })
  }
}
