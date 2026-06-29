import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { belief, decision_driver, raw_market_input, raw_competitors } = await req.json()

    if (!belief || !decision_driver || !raw_market_input) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('assumptions')
      .insert({
        belief,
        decision_driver,
        raw_market_input,
        raw_competitors: raw_competitors || [],
        status: 'active',
        // user_id is nullable — wired up when auth is added
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