import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!

async function db(path: string, method: string, body?: object, extra?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase ${method} ${path} failed: ${text}`)
  try { return JSON.parse(text) } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const { brandName, brandUrl, sector, category, timeRange, brief, userHash } = await req.json()

    if (!brandName || !brief) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const hasInsight = !!(brief.insight?.overlap)

    // Step 1: Check if brand exists
    const existing = await db(
      `/brands?name=ilike.${encodeURIComponent(brandName)}&select=id,analysis_count`,
      'GET'
    )

    let brandId: string | null = null

    if (existing && existing.length > 0) {
      // Brand exists — update it
      brandId = existing[0].id
      await db(
        `/brands?id=eq.${brandId}`,
        'PATCH',
        {
          url: brandUrl || '',
          sector: sector || '',
          category: category || '',
          last_analyzed: new Date().toISOString(),
          analysis_count: (existing[0].analysis_count || 1) + 1,
          updated_at: new Date().toISOString(),
        }
      )
    } else {
      // Brand does not exist — insert it
      const inserted = await db('/brands', 'POST', {
        name: brandName,
        url: brandUrl || '',
        sector: sector || '',
        category: category || '',
        first_seen: new Date().toISOString(),
        last_analyzed: new Date().toISOString(),
        analysis_count: 1,
      })
      brandId = inserted?.[0]?.id || null
    }

    // Step 2: Upsert user hash if provided
    if (userHash) {
      const existingUser = await db(
        `/users?user_hash=eq.${encodeURIComponent(userHash)}&select=id`,
        'GET'
      )
      if (!existingUser || existingUser.length === 0) {
        await db('/users', 'POST', {
          user_hash: userHash,
          plan: 'free',
        }).catch(() => null)
      }
    }

    // Step 3: Insert analysis — always
    await db('/analyses', 'POST', {
      brand_id: brandId,
      brand_name: brandName,
      brand_url: brandUrl || '',
      sector: sector || '',
      category: category || '',
      time_range: timeRange || '6m',
      brief,
      has_insight: hasInsight,
      user_hash: userHash || null,
    })

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Log error:', err)
    return NextResponse.json({ error: 'Logging failed.' }, { status: 500 })
  }
}
