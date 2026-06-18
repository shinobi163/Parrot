import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { name, url, category } = await req.json()

  if (!name || !url || !category) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const prompt = `You are a competitive intelligence analyst. Research the competitor below and return a JSON object ONLY — no preamble, no markdown fences, no explanation.

Competitor: ${name}
Website: ${url}
Category: ${category}

Use web search to find:
1. Recent product launches, features, or announcements (last 90 days)
2. Community discussions on Reddit, Hacker News, and Product Hunt
3. Patterns in App Store / review platform sentiment

Return exactly this JSON structure:
{
  "activity": [
    { "title": "string (10 words max)", "body": "string (2-3 sentences)", "source": "Blog|Changelog|Press" }
  ],
  "community": [
    { "title": "string (10 words max)", "body": "string (2-3 sentences)", "source": "Reddit|HN|ProductHunt" }
  ],
  "sentiment": [
    { "label": "string (theme name)", "score": number_0_to_100, "direction": "pos|neg|neu" }
  ]
}

Rules:
- activity: 2-4 items, only verified recent events, not speculation
- community: 2-4 items representing distinct discussion themes
- sentiment: 3-5 items representing recurring review themes, score = intensity 0-100
- If you cannot find real data for a field, omit that item rather than fabricate
- Return valid JSON only, nothing else`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic error:', data)
      return NextResponse.json({ error: data.error?.message || 'Anthropic API error' }, { status: 500 })
    }

    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    if (!textBlock?.text) {
      return NextResponse.json({ error: 'No text response from model.' }, { status: 500 })
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Server error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
