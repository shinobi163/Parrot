import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logError'

function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, '').trim()
}

const TIME_RANGE_LABELS: Record<string, string> = {
  '30d': 'last 30 days',
  '6m': 'last 6 months',
  '12m': 'last 12 months',
  'all': 'all time',
}

interface BriefInput {
  name: string
  url: string
  sector: string
  category: string
  timeRange: string
  cachedBrief?: object | null
}

async function fetchBrief(brand: BriefInput) {
  const timeLabel = TIME_RANGE_LABELS[brand.timeRange] || 'last 6 months'
  const yearHint = brand.timeRange === '30d' ? '2025' : brand.timeRange === '6m' ? '2025' : '2024 OR 2025'

  const prompt = `You are a market analyst. Research the brand below and return a JSON object ONLY — no preamble, no markdown fences, no explanation.

Brand: ${brand.name}
Website: ${brand.url}
Sector: ${brand.sector}
Category: ${brand.category}
Time range: Focus on the ${timeLabel} only.

Run a maximum of 3 web searches total:
1. "${brand.name} new feature launch ${yearHint}"
2. "${brand.name} site:reddit.com OR site:news.ycombinator.com ${yearHint}"
3. "${brand.name} reviews complaints ${yearHint}"

Return exactly this JSON structure:
{
  "activity": [{ "title": "string (8 words max)", "body": "string (25 words max)", "source": "Blog|Changelog|Press", "url": "" }],
  "community": [{ "title": "string (8 words max)", "body": "string (25 words max)", "source": "Reddit|HN|ProductHunt", "url": "" }],
  "sentiment": [{ "label": "string (3 words max)", "score": number_0_to_100, "direction": "pos|neg|neu", "summary": "string (15 words max)" }],
  "keywords": [{ "word": "string (2 words max)", "weight": number_1_to_10, "direction": "pos|neg|neu" }]
}

Rules:
- activity: 2 items only
- community: 2 items only
- sentiment: 3 items only
- keywords: 8-10 items only
- score = SATISFACTION (high = happy users, low = unhappy)
- Do not include citation tags or markup
- Return valid JSON only`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 }
      })
    }
  )

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Gemini error')

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new Error('No response text')

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')

  const parsed = JSON.parse(match[0])

  if (parsed.activity) parsed.activity = parsed.activity.map((i: { title: string; body: string; source: string; url: string }) => ({ ...i, title: stripCitations(i.title), body: stripCitations(i.body), url: i.url || '' }))
  if (parsed.community) parsed.community = parsed.community.map((i: { title: string; body: string; source: string; url: string }) => ({ ...i, title: stripCitations(i.title), body: stripCitations(i.body), url: i.url || '' }))
  if (parsed.sentiment) parsed.sentiment = parsed.sentiment.map((i: { label: string; score: number; direction: string; summary: string }) => ({ ...i, label: stripCitations(i.label), summary: i.summary ? stripCitations(i.summary) : '' }))
  if (parsed.keywords) parsed.keywords = parsed.keywords.map((i: { word: string; weight: number; direction: string }) => ({ ...i, word: stripCitations(i.word) }))

  return parsed
}

export async function POST(req: NextRequest) {
  const { brands, userContext } = await req.json()

  if (!brands || brands.length < 2 || brands.length > 3) {
    return NextResponse.json({ error: 'Provide 2-3 brands to compare.' }, { status: 400 })
  }

  const hasUserContext = !!(userContext?.idea || userContext?.audience || userContext?.edge)

  try {
    const briefs = await Promise.all(
      brands.map(async (brand: BriefInput) => {
        if (brand.cachedBrief) return { name: brand.name, brief: brand.cachedBrief }
        try {
          const brief = await fetchBrief(brand)
          return { name: brand.name, brief }
        } catch (err) {
          await logError('/api/compare/fetch', err, brand.name)
          throw err
        }
      })
    )

    // Build synthesis prompt — different if user context present
    const userIdea = hasUserContext
      ? `\n\nIMPORTANT: The user is building something. Evaluate each brand specifically in relation to their idea.\n- What they're building: ${userContext.idea || 'Not specified'}\n- Who it's for: ${userContext.audience || 'Not specified'}\n- Their edge: ${userContext.edge || 'Not specified'}\n\nAdd a fourth entry in the "brands" array called "Your Idea" that represents the user's product concept. Evaluate it honestly against the real brands — where it overlaps, where it has an edge, and what it's missing. Use the same card format as the other brands.`
      : ''

    const synthPrompt = `You are a market analyst. Compare the following brands based on their market signal data and return a JSON object ONLY.

${briefs.map(b => `${b.name}:\n${JSON.stringify(b.brief)}`).join('\n\n')}
${userIdea}

Return exactly this JSON structure:
{
  "sharedStrengths": [
    { "theme": "string (5 words max)", "description": "string (30 words max)" }
  ],
  "sharedWeaknesses": [
    { "theme": "string (5 words max)", "description": "string (30 words max)" }
  ],
  "brands": [
    {
      "name": "brand name",
      "unique": "string (40 words max — what makes this brand distinctly different from the others in user perception)",
      "topPositive": "string (20 words max — what users love most)",
      "topNegative": "string (20 words max — what users complain about most)"
    }
  ]
}

Rules:
- sharedStrengths: 2-3 items that appear positively across multiple brands
- sharedWeaknesses: 2-3 complaints that appear across multiple brands — the unresolved category gap
- brands: one entry per brand in input order${hasUserContext ? ', plus one entry for "Your Idea" at the end' : ''}
- For "Your Idea" entry: topPositive = stated edge, topNegative = gaps vs existing players, unique = what differentiates the concept
- Stay grounded in the signal data. Do not invent.
- Do not include citation tags or markup
- Return valid JSON only, nothing else`

    const synthResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: synthPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
        })
      }
    )

    const synthData = await synthResponse.json()

    if (!synthResponse.ok) {
      const errMsg = synthData.error?.message || 'Synthesis failed'
      await logError('/api/compare/synthesis', errMsg)
      return NextResponse.json({ error: errMsg }, { status: 500 })
    }

    const synthRaw = synthData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!synthRaw) {
      await logError('/api/compare/synthesis', 'No synthesis response')
      return NextResponse.json({ error: 'No synthesis response' }, { status: 500 })
    }

    const synthMatch = synthRaw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!synthMatch) {
      await logError('/api/compare/synthesis', 'No JSON in synthesis response')
      return NextResponse.json({ error: 'Could not parse comparison.' }, { status: 500 })
    }

    const comparison = JSON.parse(synthMatch[0])
    const fetchedBriefs = briefs.filter((b: { name: string; brief: object }) =>
      !brands.find((brand: BriefInput) => brand.name === b.name && brand.cachedBrief)
    )

    return NextResponse.json({ comparison, fetchedBriefs })

  } catch (err) {
    await logError('/api/compare', err)
    return NextResponse.json({ error: 'Comparison failed. Try again.' }, { status: 500 })
  }
}
