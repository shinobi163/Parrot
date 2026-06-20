import { NextRequest, NextResponse } from 'next/server'

function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, '').trim()
}

const TIME_RANGE_LABELS: Record<string, string> = {
  '30d': 'last 30 days',
  '6m': 'last 6 months',
  '12m': 'last 12 months',
  'all': 'all time',
}

export async function POST(req: NextRequest) {
  const { name, url, sector, category, timeRange, userContext } = await req.json()

  if (!name || !url || !sector || !category) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const timeLabel = TIME_RANGE_LABELS[timeRange] || 'last 6 months'
  const yearHint = timeRange === '30d' ? '2025' : timeRange === '6m' ? '2025' : '2024 OR 2025'

  const prompt = `You are a market analyst. Research the brand below and return a JSON object ONLY — no preamble, no markdown fences, no explanation.

Brand: ${name}
Website: ${url}
Sector: ${sector}
Category: ${category}
Time range: Focus on the ${timeLabel} only. Ignore older data unless nothing recent exists.

Frame your entire analysis through the lens of a ${category} brand within the ${sector} sector. This determines which peer brands, communities, and review sources are relevant.

Run a maximum of 4 web searches total. Use these searches:
1. "${name} new feature launch ${yearHint}"
2. "${name} site:reddit.com OR site:news.ycombinator.com ${yearHint}"
3. "${name} reviews complaints ${yearHint}"

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
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
        })
      }
    )

    const geminiData = await geminiResponse.json()

    if (!geminiResponse.ok) {
      console.error('Gemini error:', geminiData)
      return NextResponse.json({ error: geminiData.error?.message || 'Gemini API error' }, { status: 500 })
    }

    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) {
      console.error('No text in Gemini response:', JSON.stringify(geminiData))
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
        ...i, label: stripCitations(i.label), summary: i.summary ? stripCitations(i.summary) : ''
      }))
    }
    if (parsed.keywords) {
      parsed.keywords = parsed.keywords.map((i: { word: string; weight: number; direction: string }) => ({
        ...i, word: stripCitations(i.word)
      }))
    }

    // Insight call — Gemini, no web search, reasoning over existing data only
    if (userContext?.idea || userContext?.audience || userContext?.edge) {
      const insightPrompt = `You are a sharp market analyst helping a founder or PM understand what a brand's market signal means for their specific idea.

Brand analyzed: ${name} (${category} · ${sector})
Time range: ${timeLabel}

What the market signal shows:
RECENT ACTIVITY: ${JSON.stringify(parsed.activity)}
COMMUNITY SIGNAL: ${JSON.stringify(parsed.community)}
SENTIMENT: ${JSON.stringify(parsed.sentiment)}

The user's context:
- What they're building: ${userContext.idea || 'Not specified'}
- Who it's for: ${userContext.audience || 'Not specified'}
- Their edge: ${userContext.edge || 'Not specified'}

Return a JSON object ONLY with this exact structure:
{
  "overlap": "2-3 sentences. Where ${name} already plays well and owns the market. Grounded in the signal above.",
  "weakness": "2-3 sentences. Specific unresolved complaints from the signal directly relevant to the user's idea. Paraphrase actual signal where possible.",
  "gap": "1-2 sentences. The intersection of their weakness and the user's stated edge. Be direct, not hedged.",
  "watch": "1-2 sentences. One or two signals from the brief worth monitoring given the user's specific idea. Not warnings — just things to track."
}

Rules:
- Stay grounded in the signal data. Do not invent insight not present in the data.
- Do not give a verdict. Do not say "you should build this" or "don't build this".
- Do not use filler phrases like "it's worth noting" or "interestingly".
- Be direct. One idea per sentence.
- Return valid JSON only, nothing else.`

      try {
        const insightResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: insightPrompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
            })
          }
        )

        const insightData = await insightResponse.json()
        const insightRaw = insightData.candidates?.[0]?.content?.parts?.[0]?.text

        if (insightRaw) {
          const insightMatch = insightRaw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
          if (insightMatch) {
            parsed.insight = JSON.parse(insightMatch[0])
          }
        }
      } catch (insightErr) {
        console.error('Insight call failed (non-fatal):', insightErr)
      }
    }

    return NextResponse.json(parsed)

  } catch (err) {
    console.error('Server error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
