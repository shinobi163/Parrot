import { NextRequest, NextResponse } from 'next/server'

function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, '').trim()
}

export async function POST(req: NextRequest) {
  const { name, url, category } = await req.json()

  if (!name || !url || !category) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const prompt = `You are a competitive intelligence analyst. Research the competitor below and return a JSON object ONLY — no preamble, no markdown fences, no explanation.

Competitor: ${name}
Website: ${url}
Category: ${category}

Search for:
1. "${name} new feature launch 2025"
2. "${name} site:reddit.com OR site:news.ycombinator.com"
3. "${name} reviews complaints 2025"

Return exactly this JSON structure:
{
  "activity": [
    { "title": "string (8 words max)", "body": "string (30 words max)", "source": "Blog|Changelog|Press" }
  ],
  "community": [
    { "title": "string (8 words max)", "body": "string (30 words max)", "source": "Reddit|HN|ProductHunt" }
  ],
  "sentiment": [
    { "label": "string (3 words max)", "score": number_0_to_100, "direction": "pos|neg|neu" }
  ]
}

Rules:
- activity: 2-3 items only
- community: 2-3 items only
- sentiment: 3-4 items only
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

    // Extract JSON — strip markdown fences if present
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in response:', raw)
      return NextResponse.json({ error: 'Could not parse response.' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.activity) {
      parsed.activity = parsed.activity.map((i: { title: string; body: string; source: string }) => ({
        ...i, title: stripCitations(i.title), body: stripCitations(i.body)
      }))
    }
    if (parsed.community) {
      parsed.community = parsed.community.map((i: { title: string; body: string; source: string }) => ({
        ...i, title: stripCitations(i.title), body: stripCitations(i.body)
      }))
    }
    if (parsed.sentiment) {
      parsed.sentiment = parsed.sentiment.map((i: { label: string; score: number; direction: string }) => ({
        ...i, label: stripCitations(i.label)
      }))
    }

    return NextResponse.json(parsed)

  } catch (err) {
    console.error('Server error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
