import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!

async function supabase(path: string, method: string, body?: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res.json().catch(() => null)
}

export async function POST(req: NextRequest) {
  try {
    const { brandName, brandUrl, sector, category, timeRange, brief, userHash } = await req.json()

    if (!brandName || !brief) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const hasInsight = !!(brief.insight?.overlap)

    // Upsert brand — insert if new, update last_analyzed and increment count if exists
    const brandResult = await supabase(
      '/brands?on_conflict=name',
      'POST',
      {
        name: brandName,
        url: brandUrl || '',
        sector: sector || '',
        category: category || '',
        last_analyzed: new Date().toISOString(),
        analysis_count: 1,
      }
    ).catch(async () => {
      // Brand already exists — update it
      await supabase(
        `/brands?name=eq.${encodeURIComponent(brandName)}`,
        'PATCH',
        {
          last_analyzed: new Date().toISOString(),
          url: brandUrl || '',
          sector: sector || '',
          category: category || '',
        }
      )
      // Increment count separately
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_analysis_count`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ brand_name: brandName }),
      })
      // Fetch brand id
      const brands = await supabase(`/brands?name=eq.${encodeURIComponent(brandName)}&select=id`, 'GET')
      return brands?.[0] || null
    })

    const brandId = Array.isArray(brandResult) ? brandResult[0]?.id : brandResult?.id

    // Upsert user hash
    if (userHash) {
      await supabase('/users?on_conflict=user_hash', 'POST', {
        user_hash: userHash,
        plan: 'free',
      }).catch(() => null) // Ignore if already exists
    }

    // Insert analysis
    await supabase('/analyses', 'POST', {
      brand_id: brandId || null,
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
    // Non-fatal — log errors but don't break the user experience
    console.error('Log error:', err)
    return NextResponse.json({ error: 'Logging failed.' }, { status: 500 })
  }
}
