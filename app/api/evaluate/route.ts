import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLM, extractJSON, stripCitations } from '@/lib/llm'

type ClaimComponent = {
  component: string
  description: string
}

type EvidenceItem = {
  source: string
  date: string
  what_happened: string
}

type ResearchResult = {
  direct_signals_found: boolean
  evidence: EvidenceItem[]
  adjacent_signals: string[]
}

type ComponentBreakdown = {
  component: string
  status: 'holding' | 'weakening' | 'broken'
  note: string
}

type Synthesis = {
  verdict_line: string
  evidence: Array<EvidenceItem & { why_it_matters: string }>
  component_breakdown: ComponentBreakdown[]
  next_action: {
    text: string
    action_type: 'keep_watching' | 'investigate' | 'pivot_conversation' | 'validate_directly'
  }
}

const PROMPT_VERSION = 'v1-gemini-search'

async function researchAssumption(
  belief: string,
  marketInput: string,
  competitors: string[]
): Promise<ResearchResult> {
  const competitorLine = competitors.length > 0
    ? `Pay special attention to these named competitors: ${competitors.join(', ')}.`
    : ''

  const prompt = `Research recent public signal relevant to this startup assumption.

Belief: "${belief}"
Market: ${marketInput}
${competitorLine}

Search for recent news, competitor moves, funding events, or market activity from the last 60 days that is DIRECTLY relevant to this specific belief - not just the general topic.

Run a maximum of 3 web searches focused on finding direct evidence for or against this belief.

Return JSON only, no preamble, no markdown fences:
{
  "direct_signals_found": boolean,
  "evidence": [
    { "source": "string - publication or entity name", "date": "string - relative or approximate date", "what_happened": "string, max 25 words, factual only" }
  ],
  "adjacent_signals": ["string - if no direct signal found, list 2-3 adjacent things you did find, max 15 words each"]
}

Rules:
- evidence: maximum 3 items, only include if genuinely relevant to the specific belief, not the general market
- If you find no direct signal, set direct_signals_found to false and leave evidence empty
- adjacent_signals: only populate if direct_signals_found is false
- Do not fabricate sources or dates. If uncertain, omit the item.
- Return valid JSON only`

  const result = await callLLM(prompt, { useSearch: true, temperature: 0.15, maxOutputTokens: 1200 })
  const cleaned = stripCitations(result.text)
  return extractJSON<ResearchResult>(cleaned)
}

async function synthesizeVerdict(
  belief: string,
  decisionDriver: string,
  claimComponents: ClaimComponent[],
  research: ResearchResult
): Promise<Synthesis> {
  const prompt = `You are producing a verdict on whether a startup founder's assumption is holding up against market signal.

Belief: "${belief}"
Why this matters: "${decisionDriver}"

Claim components being tested:
${claimComponents.map((c, i) => `${i + 1}. ${c.component} (${c.description})`).join('\n')}

Research findings:
${JSON.stringify(research, null, 2)}

Your job:
1. Determine an overall verdict: "holding" (signal supports or is neutral), "weakening" (1-2 signals challenge a component), or "broken" (multiple independent signals contradict the core claim)
2. Write ONE sentence verdict_line that states the verdict and names WHICH specific component is under pressure - not the whole belief generically
3. For each evidence item from research, write a "why_it_matters" sentence that explicitly connects it to the exact belief text above. If you cannot write a specific connection without inferring beyond what the research gave you, do not include that evidence item.
4. For EACH claim component listed above, assess its individual status (holding/weakening/broken) based on the research - components should NOT all move together unless the evidence genuinely affects all of them
5. Write ONE next_action - a single concrete thing to watch or do next, tied to the verdict

Return JSON only, no preamble, no markdown fences:
{
  "verdict_line": "string, one sentence, names the specific component under pressure",
  "evidence": [
    { "source": "string", "date": "string", "what_happened": "string", "why_it_matters": "string, must reference the specific belief, max 25 words" }
  ],
  "component_breakdown": [
    { "component": "string - copy exactly from the claim components above", "status": "holding|weakening|broken", "note": "string, max 20 words, why this specific status" }
  ],
  "next_action": {
    "text": "string, one concrete action or thing to watch, max 35 words",
    "action_type": "keep_watching|investigate|pivot_conversation|validate_directly"
  }
}

Rules:
- Do not give every component the same status unless evidence genuinely supports that
- evidence array should be empty if research.direct_signals_found is false
- Stay grounded in the research provided. Do not invent connections.
- Return valid JSON only`

  const result = await callLLM(prompt, { temperature: 0.1, maxOutputTokens: 1500 })
  return extractJSON<Synthesis>(result.text)
}

function buildDarkSynthesis(
  belief: string,
  research: ResearchResult,
  leadingIndicators: string[]
): Synthesis {
  return {
    verdict_line: 'No direct public signal found for this assumption in the last 60 days.',
    evidence: [],
    component_breakdown: [],
    next_action: {
      text: leadingIndicators.length > 0
        ? `We're now watching: ${leadingIndicators[0]}`
        : 'Continue monitoring - no leading indicators defined for this assumption yet.',
      action_type: 'keep_watching',
    },
  }
}

export async function POST(req: NextRequest) {
  try {
    const { assumption_id } = await req.json()

    if (!assumption_id) {
      return NextResponse.json({ error: 'Missing assumption_id.' }, { status: 400 })
    }

    const { data: assumption, error: fetchError } = await supabase
      .from('assumptions')
      .select('id, belief, decision_driver, raw_market_input, raw_competitors, claim_components, leading_indicators')
      .eq('id', assumption_id)
      .single()

    if (fetchError || !assumption) {
      return NextResponse.json({ error: 'Assumption not found.' }, { status: 404 })
    }

    const claimComponents: ClaimComponent[] = assumption.claim_components || []
    const leadingIndicators: string[] = assumption.leading_indicators || []
    const competitors: string[] = assumption.raw_competitors || []

    // Step 1: research
    const research = await researchAssumption(assumption.belief, assumption.raw_market_input, competitors)

    // Step 2: synthesize verdict, or build DARK state if no signal found
    let synthesis: Synthesis
    let verdict: 'holding' | 'weakening' | 'broken' | 'dark'

    if (!research.direct_signals_found || research.evidence.length === 0) {
      verdict = 'dark'
      synthesis = buildDarkSynthesis(assumption.belief, research, leadingIndicators)
    } else {
      synthesis = await synthesizeVerdict(
        assumption.belief,
        assumption.decision_driver,
        claimComponents,
        research
      )

      // Derive overall verdict from component breakdown
      const statuses = synthesis.component_breakdown.map(c => c.status)
      if (statuses.includes('broken')) {
        verdict = 'broken'
      } else if (statuses.includes('weakening')) {
        verdict = 'weakening'
      } else {
        verdict = 'holding'
      }
    }

    const { data: evaluation, error: insertError } = await supabase
      .from('assumption_evaluations')
      .insert({
        assumption_id,
        verdict,
        confidence: research.direct_signals_found ? 0.75 : 0.3,
        trigger_type: 'user_pull',
        challenge_type: null,
        prompt_version: PROMPT_VERSION,
        synthesis,
        signals_used: [],
        entities_implicated: [],
      })
      .select()
      .single()

    if (insertError) {
      console.error('Evaluation insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save evaluation.' }, { status: 500 })
    }

    await supabase
      .from('assumptions')
      .update({ status: verdict, last_evaluated_at: new Date().toISOString() })
      .eq('id', assumption_id)

    return NextResponse.json({
      evaluation: { ...evaluation, synthesis },
    })

  } catch (err) {
    console.error('Evaluate route error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}