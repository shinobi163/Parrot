'use client'

import { useState } from 'react'

type EvidenceItem = {
  source: string
  date: string
  what_happened: string
  why_it_matters: string
}

type ComponentItem = {
  component: string
  status: 'holding' | 'weakening' | 'broken'
  note: string
}

type Synthesis = {
  verdict_line: string
  evidence: EvidenceItem[]
  component_breakdown: ComponentItem[]
  next_action: {
    text: string
    action_type: string
  }
}

type Evaluation = {
  id: string
  verdict: 'holding' | 'weakening' | 'broken' | 'dark'
  synthesis: Synthesis
}

type Assumption = {
  id: string
  belief: string
  decision_driver: string
  raw_market_input: string
  raw_competitors: string[]
}

const VERDICT_COLOR: Record<string, string> = {
  holding: '#22c55e',
  weakening: '#f59e0b',
  broken: '#ef4444',
  dark: '#6b7280',
}

const COMPONENT_SYMBOL: Record<string, string> = {
  holding: '✓',
  weakening: '~',
  broken: '✗',
}

export default function Home() {
  const [belief, setBelief] = useState('')
  const [decisionDriver, setDecisionDriver] = useState('')
  const [market, setMarket] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assumption, setAssumption] = useState<Assumption | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [evaluating, setEvaluating] = useState(false)

  async function handleSubmit() {
    if (!belief.trim() || !decisionDriver.trim() || !market.trim()) {
      setError('Please fill in the first three fields.')
      return
    }

    setLoading(true)
    setError('')
    setEvaluation(null)

    try {
      const res = await fetch('/api/assumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          belief: belief.trim(),
          decision_driver: decisionDriver.trim(),
          raw_market_input: market.trim(),
          raw_competitors: competitors
            .split(',')
            .map(c => c.trim())
            .filter(Boolean),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        return
      }

      setAssumption(data.assumption)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleEvaluate() {
    if (!assumption) return

    setEvaluating(true)
    setError('')

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assumption_id: assumption.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Evaluation failed.')
        return
      }

      setEvaluation(data.evaluation)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setEvaluating(false)
    }
  }

  function handleReset() {
    setBelief('')
    setDecisionDriver('')
    setMarket('')
    setCompetitors('')
    setAssumption(null)
    setEvaluation(null)
    setError('')
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.logo}>Candor</h1>
          <p style={styles.tagline}>Are your roadmap assumptions still valid?</p>
        </div>

        {/* Input form */}
        {!assumption && (
          <div style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>I believe</label>
              <textarea
                style={styles.textarea}
                placeholder="e.g. Quick commerce has not penetrated beyond Tier 1 cities in India"
                value={belief}
                onChange={e => setBelief(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                rows={3}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>This matters for</label>
              <textarea
                style={styles.textarea}
                placeholder="e.g. Our decision to focus the first version on metro cities only"
                value={decisionDriver}
                onChange={e => setDecisionDriver(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                rows={2}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>The market is</label>
              <input
                style={styles.input}
                placeholder="e.g. Quick commerce, India"
                value={market}
                onChange={e => setMarket(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                I&apos;m watching
                <span style={styles.optional}> - optional, comma separated</span>
              </label>
              <input
                style={styles.input}
                placeholder="e.g. Zepto, Blinkit, Swiggy Instamart"
                value={competitors}
                onChange={e => setCompetitors(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="button"
              style={loading ? { ...styles.button, opacity: 0.6 } : styles.button}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save assumption'}
            </button>
          </div>
        )}

        {/* Assumption saved - show summary + Check Now */}
        {assumption && !evaluation && (
          <div style={styles.savedCard}>
            <p style={styles.savedLabel}>Assumption saved</p>
            <p style={styles.savedBelief}>&ldquo;{assumption.belief}&rdquo;</p>
            <p style={styles.savedMeta}>
              {assumption.raw_market_input}
              {assumption.raw_competitors?.length > 0 &&
                ` - watching ${assumption.raw_competitors.join(', ')}`}
            </p>

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="button"
              style={evaluating ? { ...styles.button, opacity: 0.6 } : styles.button}
              onClick={handleEvaluate}
              disabled={evaluating}
            >
              {evaluating ? 'Checking...' : 'Check now'}
            </button>

            <button
              type="button"
              style={styles.ghost}
              onClick={handleReset}
            >
              Start over
            </button>
          </div>
        )}

        {/* Verdict output */}
        {evaluation && (
          <div style={styles.verdict}>

            {/* Verdict line */}
            <div style={styles.verdictHeader}>
              <span
                style={{
                  ...styles.verdictBadge,
                  color: VERDICT_COLOR[evaluation.verdict],
                  borderColor: VERDICT_COLOR[evaluation.verdict],
                }}
              >
                {evaluation.verdict.toUpperCase()}
              </span>
              <p style={styles.verdictLine}>
                {evaluation.synthesis.verdict_line}
              </p>
            </div>

            {/* Evidence block */}
            <div style={styles.section}>
              <p style={styles.sectionLabel}>Evidence</p>
              {evaluation.synthesis.evidence.map((e, i) => (
                <div key={i} style={styles.evidenceCard}>
                  <div style={styles.evidenceMeta}>
                    <span style={styles.evidenceSource}>{e.source}</span>
                    <span style={styles.evidenceDate}>{e.date}</span>
                  </div>
                  <p style={styles.evidenceWhat}>{e.what_happened}</p>
                  <p style={styles.evidenceWhy}>{e.why_it_matters}</p>
                </div>
              ))}
            </div>

            {/* Component breakdown */}
            <div style={styles.section}>
              <p style={styles.sectionLabel}>Assumption components</p>
              {evaluation.synthesis.component_breakdown.map((c, i) => (
                <div key={i} style={styles.componentRow}>
                  <span
                    style={{
                      ...styles.componentSymbol,
                      color: VERDICT_COLOR[c.status],
                    }}
                  >
                    {COMPONENT_SYMBOL[c.status]}
                  </span>
                  <div>
                    <p style={styles.componentName}>{c.component}</p>
                    <p style={styles.componentNote}>{c.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Next action */}
            <div style={styles.nextAction}>
              <p style={styles.sectionLabel}>Next action</p>
              <p style={styles.nextActionText}>
                {evaluation.synthesis.next_action.text}
              </p>
            </div>

            <button
              type="button"
              style={styles.ghost}
              onClick={handleReset}
            >
              Check another assumption
            </button>
          </div>
        )}

      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '48px 16px',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '40px',
  },
  logo: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0 0 8px 0',
    letterSpacing: '-0.5px',
  },
  tagline: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: '0',
    color: '#4b5563',
  },
  textarea: {
    backgroundColor: '#111111',
    border: '1px solid #222222',
    borderRadius: '6px',
    color: '#e5e5e5',
    fontSize: '15px',
    lineHeight: '1.5',
    padding: '12px',
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
  },
  input: {
    backgroundColor: '#111111',
    border: '1px solid #222222',
    borderRadius: '6px',
    color: '#e5e5e5',
    fontSize: '15px',
    padding: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    backgroundColor: '#ffffff',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 24px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#4b5563',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 0',
    textDecoration: 'underline',
    display: 'block',
    marginTop: '8px',
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    margin: 0,
  },
  savedCard: {
    backgroundColor: '#111111',
    border: '1px solid #222222',
    borderRadius: '8px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  savedLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  savedBelief: {
    fontSize: '16px',
    color: '#ffffff',
    margin: 0,
    lineHeight: '1.5',
  },
  savedMeta: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
  },
  verdict: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  verdictHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  verdictBadge: {
    fontSize: '13px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    border: '1px solid',
    borderRadius: '4px',
    padding: '3px 8px',
    alignSelf: 'flex-start',
  },
  verdictLine: {
    fontSize: '18px',
    color: '#ffffff',
    margin: 0,
    lineHeight: '1.5',
    fontWeight: '500',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  evidenceCard: {
    backgroundColor: '#111111',
    border: '1px solid #1f1f1f',
    borderRadius: '6px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  evidenceMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evidenceSource: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#9ca3af',
  },
  evidenceDate: {
    fontSize: '12px',
    color: '#4b5563',
  },
  evidenceWhat: {
    fontSize: '14px',
    color: '#e5e5e5',
    margin: 0,
    lineHeight: '1.5',
  },
  evidenceWhy: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
    lineHeight: '1.5',
    borderLeft: '2px solid #222222',
    paddingLeft: '10px',
  },
  componentRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  componentSymbol: {
    fontSize: '16px',
    fontWeight: '700',
    lineHeight: '1.4',
    flexShrink: 0,
  },
  componentName: {
    fontSize: '14px',
    color: '#e5e5e5',
    margin: '0 0 2px 0',
  },
  componentNote: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
  },
  nextAction: {
    backgroundColor: '#111111',
    border: '1px solid #222222',
    borderRadius: '6px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  nextActionText: {
    fontSize: '14px',
    color: '#e5e5e5',
    margin: 0,
    lineHeight: '1.6',
  },
}