import { NextRequest, NextResponse } from 'next/server'

function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, '').trim()
}

export async function POST(req: NextRequest) {
  const { name, url, sector, category } = await req.json()

  if (!name || !url || !sector || !category) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const prompt = `You are a market analyst. Research the brand below and return a JSON object ONLY — no preamble, no markdown fences, no explanation.

Brand: ${name}
Website: ${url}
Sector: ${sector}
Category: ${category}

Frame your entire analysis through the lens of a ${category} brand within the ${sector} sector. This determines which peer brands, communities, and review sources are relevant.

Run a maximum of 4 web searches total. Use these searches:
1. "${name} new feature launch 2025"
2. "${name} site:reddit.com OR site:news.ycombinator.com"
3. "${name} reviews complaints 2025"

Return exactly this JSON structure:
{
  "activity": [
    { "title": "string (8 words max)", "body": "string (30 words max)", "source": "Blog|Changelog|Press", "url": "direct URL or empty string" }
  ],
  "community": [
    { "title": "string (8 words max)", "body": "string (30 words max)", "source": "Reddit|HN|ProductHunt", "url": "direct URL or empty string" }
  ],
  "sentiment": [
    { "label": "string (3 words max)", "score": number_0_to_100, "direction": "pos|neg|neu", "summary": "string (20 words max)" }
  ],
  "keywords": [
    { "word": "single word or short phrase (2 words max)", "weight": number_1_to_10, "direction": "pos|neg|neu" }
  ]
}

Rules:
- activity: 2-3 items only
- community: 2-3 items only
- sentiment: 3-4 items only
- score means SATISFACTION level: high (70-100) = users happy, low (0-30) = users unhappy, mid (40-60) = mixed
- direction: pos = users praise this, neg = users complain about this, neu = mixed or neutral
- summary: one plain sentence e.g. "Users love the speed and simplicity" or "Frequent complaints about pricing"
- keywords: 12-18 words extracted from community discussions and review sentiment only. weight = frequency/strength (1=rarely, 10=very frequently). direction = sentiment toward that keyword
- url: actual URL if found, otherwise empty string ""
- Do not include any citation tags or markup in string values
- If you cannot find real data for a field, omit that item rather than fabricate
- Return valid JSON only, nothing else`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
          }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Gemini error:', data)
      return NextResponse.json({ error: data.error?.message || 'Gemini API error' }, { status: 500 })
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) {
      console.error('No text in Gemini response:', JSON.stringify(data))
      return NextResponse.json({ error: 'No text response from model.' }, { status: 500 })
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in response:', raw)
      return NextResponse.json({ error: 'Could not parse response.' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.activity) {
      parsed.activity = parsed.activity.map((i: { title: string; body: string; source: string; url: string }) => ({
        ...i, title: stripCitations(i.title), body: stripCitations(i.body), url: i.url || ''
      }))
    }
    if (parsed.community) {
      parsed.community = parsed.community.map((i: { title: string; body: string; source: string; url: string }) => ({
        ...i, title: stripCitations(i.title), body: stripCitations(i.body), url: i.url || ''
      }))
    }
    if (parsed.sentiment) {
      parsed.sentiment = parsed.sentiment.map((i: { label: string; score: number; direction: string; summary: string }) => ({
        ...i,
        label: stripCitations(i.label),
        summary: i.summary ? stripCitations(i.summary) : ''
      }))
    }
    if (parsed.keywords) {
      parsed.keywords = parsed.keywords.map((i: { word: string; weight: number; direction: string }) => ({
        ...i, word: stripCitations(i.word)
      }))
    }

    return NextResponse.json(parsed)

  } catch (err) {
    console.error('Server error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
