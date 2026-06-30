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

Be specific to this belief and market. No generic answers like "monitor competitors" or "watch the news."

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
      const [components, indicators] = await Promise.all([
        extractClaimComponents(belief, raw_market_input),
        generateLeadingIndicators(belief, raw_market_input),
      ])
      claimComponents = components
      leadingIndicators = indicators
    } catch (llmErr) {
      // If Gemini fails, save the assumption anyway with empty arrays.
      // Don't block assumption creation on LLM availability.
      console.error('Claim component extraction failed:', llmErr)
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