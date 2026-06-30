import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLM, extractJSON } from '@/lib/llm'

type ClaimComponent = {
  component: string
  description: string
}

async function extractClaimComponents(belief: string, marketInput: string): Promise<ClaimComponent[]> {
  const prompt = `You are decomposing a startup founder's market assumption into its testable components.

Belief: "${belief}"
Market context: ${marketInput}

Break this belief into 3-5 distinct, testable components. Each component should be a specific claim that could independently be proven right or wrong — not a restatement of the whole belief.

Example:
Belief: "B2B SaaS buyers in India are shifting to annual contracts over monthly"
Components:
[
  { "component": "Buyer preference is shifting toward longer commitment", "description": "Annual contracts are being chosen over monthly at increasing rates" },
  { "component": "This shift is happening now, not historically", "description": "The change is recent, not a long-standing pattern" },
  { "component": "This applies to the Indian market specifically", "description": "Not a global SaaS trend being misattributed to India" }
]

Return JSON only, no preamble, no markdown fences:
{
  "components": [
    { "component": "string, max 12 words", "description": "string, max 20 words" }
  ]
}`

  const result = await callLLM(prompt, { temperature: 0.1, maxOutputTokens: 600 })
  const parsed = extractJSON<{ components: ClaimComponent[] }>(result.text)
  return parsed.components
}

async function generateLeadingIndicators(belief: string, marketInput: string): Promise<string[]> {
  const prompt = `Given this startup assumption, what are 3 leading indicators in public data that would be early evidence this assumption is breaking?

Belief: "${belief}"
Market: ${marketInput}

CRITICAL: Every indicator must be grounded in mechanisms and institutions that actually exist in this specific market and geography. Do not default to US-centric patterns (class-action lawsuits, Glassdoor reviews, union drives) unless the stated market is the US. If the market is India, consider what's actually relevant there - platform-specific driver forums, local labor ministry actions, state-level gig worker welfare schemes, platform app store reviews, vernacular news coverage, or social media discourse on platforms actually used in that market.

A leading indicator must satisfy ALL of these:
1. It would appear BEFORE the assumption visibly breaks, not after - avoid lawsuits, public sentiment surveys, or anything that requires the problem to already be severe and organized
2. It must be checkable through normal public web search or news monitoring - not investor calls, not data platforms don't publish, not internal company metrics
3. It should be a specific, observable action by a specific type of entity - a hiring pattern, a pricing change, a feature launch, a regulatory filing, a job posting trend
4. It must reflect institutions, behaviors, and information sources that genuinely exist in the stated market - if you are unsure whether something exists in this market, do not include it

Bad example (lagging, wrong market): "Rise in class-action lawsuits citing overwork" - assumes US legal system
Good example (leading, market-aware): "A major platform like Zomato or Swiggy announces a driver fatigue or rest-break feature in their partner app" - specific to Indian gig platforms

Be specific to this belief and market. No generic answers.

Return JSON only, no preamble:
{
  "indicators": ["string", "string", "string"]
}`

  const result = await callLLM(prompt, { temperature: 0.2, maxOutputTokens: 300 })
  const parsed = extractJSON<{ indicators: string[] }>(result.text)
  return parsed.indicators
}

export async function POST(req: NextRequest) {
  try {
    const { belief, decision_driver, raw_market_input, raw_competitors } = await req.json()

    if (!belief || !decision_driver || !raw_market_input) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    // Run both Gemini calls in parallel — independent of each other
    let claimComponents: ClaimComponent[] = []
    let leadingIndicators: string[] = []

    try {
  claimComponents = await extractClaimComponents(belief, raw_market_input)
} catch (llmErr) {
  console.error('Claim component extraction failed:', llmErr)
}

try {
  leadingIndicators = await generateLeadingIndicators(belief, raw_market_input)
} catch (llmErr) {
  console.error('Leading indicator generation failed:', llmErr)
}

    const { data, error } = await supabase
      .from('assumptions')
      .insert({
        belief,
        decision_driver,
        raw_market_input,
        raw_competitors: raw_competitors || [],
        claim_components: claimComponents,
        leading_indicators: leadingIndicators,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { error: 'Failed to save assumption.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ assumption: data })

  } catch (err) {
    console.error('Assumptions route error:', err)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}