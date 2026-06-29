import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Phase 0: hardcoded verdict to validate output format
// Real Gemini evaluation replaces this in Phase 1

const HARDCODED_EVALUATION = {
  verdict: 'weakening',
  confidence: 0.72,
  trigger_type: 'user_pull',
  challenge_type: 'competitor_move',
  prompt_version: 'v0-hardcoded',
  synthesis: {
    verdict_line: 'Two signals in the last 30 days challenge your pricing assumption, not your market size assumption.',
    evidence: [
      {
        source: 'Zepto via TechCrunch',
        date: '23 days ago',
        what_happened: 'Zepto launched 15-minute delivery in Lucknow and Jaipur.',
        why_it_matters: 'Your assumption that quick commerce has not penetrated beyond metros is directly contradicted by this market entry.',
      },
      {
        source: 'Blinkit via Economic Times',
        date: '11 days ago',
        what_happened: 'Blinkit announced expansion to 12 new Tier 2 cities before Q3.',
        why_it_matters: 'A second major player moving into the same geography strengthens the contradiction — this is a pattern, not an outlier.',
      },
    ],
    component_breakdown: [
      {
        component: 'Market exists and is underserved',
        status: 'holding',
        note: 'No contradicting signal found.',
      },
      {
        component: 'Incumbents are not moving into Tier 2',
        status: 'weakening',
        note: '2 signals show direct Tier 2 expansion by watched competitors.',
      },
      {
        component: 'Price sensitivity is below ₹500',
        status: 'holding',
        note: 'No pricing signal found in this period.',
      },
    ],
    next_action: {
      text: 'Watch whether Zepto expands to 3 more Tier 2 cities in the next 45 days. If they do, your metro-first positioning assumption needs revisiting before your next sprint.',
      action_type: 'keep_watching',
    },
  },
}

export async function POST(req: NextRequest) {
  try {
    const { assumption_id } = await req.json()

    if (!assumption_id) {
      return NextResponse.json(
        { error: 'Missing assumption_id.' },
        { status: 400 }
      )
    }

    // Verify the assumption exists
    const { data: assumption, error: fetchError } = await supabase
      .from('assumptions')
      .select('id, belief, status')
      .eq('id', assumption_id)
      .single()

    if (fetchError || !assumption) {
      return NextResponse.json(
        { error: 'Assumption not found.' },
        { status: 404 }
      )
    }

    // Write the hardcoded evaluation to DB
    const { data: evaluation, error: insertError } = await supabase
      .from('assumption_evaluations')
      .insert({
        assumption_id,
        verdict: HARDCODED_EVALUATION.verdict,
        confidence: HARDCODED_EVALUATION.confidence,
        trigger_type: HARDCODED_EVALUATION.trigger_type,
        challenge_type: HARDCODED_EVALUATION.challenge_type,
        prompt_version: HARDCODED_EVALUATION.prompt_version,
        synthesis: HARDCODED_EVALUATION.synthesis,
        signals_used: [],
        entities_implicated: [],
      })
      .select()
      .single()

    if (insertError) {
      console.error('Evaluation insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save evaluation.' },
        { status: 500 }
      )
    }

    // Update assumption status to match verdict
    await supabase
      .from('assumptions')
      .update({
        status: HARDCODED_EVALUATION.verdict,
        last_evaluated_at: new Date().toISOString(),
      })
      .eq('id', assumption_id)

    return NextResponse.json({
      evaluation: {
        ...evaluation,
        synthesis: HARDCODED_EVALUATION.synthesis,
      },
    })

  } catch (err) {
    console.error('Evaluate route error:', err)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}