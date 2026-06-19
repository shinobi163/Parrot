import { NextRequest, NextResponse } from 'next/server'

// Strip citation tags the web search tool injects into body text
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

Run a maximum of 4 web searches total. Use these searches:
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic error:', data)
      return NextResponse.json({ error: data.error?.message || 'Anthropic API error' }, { status: 500 })
    }

    // Find the last text block — the final JSON output after all tool calls
    const textBlocks = data.content?.filter((b: { type: string }) => b.type === 'text')
    const textBlock = textBlocks?.[textBlocks.length - 1]

    if (!textBlock?.text) {
      console.error('No text block found. Content:', JSON.stringify(data.content))
      return NextResponse.json({ error: 'No text response from model.' }, { status: 500 })
    }

    // Extract JSON — handle markdown fences and leading/trailing text
    const raw = textBlock.text
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
