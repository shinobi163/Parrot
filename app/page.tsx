'use client'

import { useState, useEffect } from 'react'
import styles from './page.module.css'

const DAILY_LIMIT = 3
const STORAGE_KEY = 'parrot_usage'

type Direction = 'pos' | 'neg' | 'neu'

interface ActivityItem { title: string; body: string; source: string }
interface CommunityItem { title: string; body: string; source: string }
interface SentimentItem { label: string; score: number; direction: Direction }
interface Brief {
  activity: ActivityItem[]
  community: CommunityItem[]
  sentiment: SentimentItem[]
}

function getToday() { return new Date().toISOString().slice(0, 10) }

function getUsage(): { date: string; count: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { date: getToday(), count: 0 }
    const data = JSON.parse(raw)
    if (data.date !== getToday()) return { date: getToday(), count: 0 }
    return data
  } catch { return { date: getToday(), count: 0 } }
}

function saveUsage(count: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getToday(), count }))
}

const STEPS = [
  'Reading blog and changelog',
  'Checking Reddit and Hacker News',
  'Scanning Product Hunt',
  'Pulling App Store reviews',
  'Synthesizing brief',
]

const CATEGORIES = [
  'Project management', 'Developer tools', 'AI / LLM',
  'Design tools', 'Analytics', 'CRM / Sales', 'Marketing', 'Other',
]

export default function Home() {
  const [screen, setScreen] = useState<'input' | 'loading' | 'results'>('input')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(DAILY_LIMIT)
  const [activeStep, setActiveStep] = useState(-1)
  const [doneSteps, setDoneSteps] = useState<number[]>([])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [analyzedName, setAnalyzedName] = useState('')
  const [analyzedUrl, setAnalyzedUrl] = useState('')
  const [analyzedAt, setAnalyzedAt] = useState('')

  useEffect(() => {
    setRemaining(Math.max(0, DAILY_LIMIT - getUsage().count))
  }, [])

  async function analyze() {
    setError('')
    if (!name.trim()) { setError('Enter a competitor name to continue.'); return }
    if (!url.trim()) { setError('Enter the competitor website.'); return }
    if (!category) { setError('Select a category.'); return }
    const usage = getUsage()
    if (usage.count >= DAILY_LIMIT) return

    setAnalyzedName(name.trim())
    setAnalyzedUrl(url.trim())
    setScreen('loading')
    setActiveStep(0)
    setDoneSteps([])

    // Animate steps
    let step = 0
    const interval = setInterval(() => {
      setDoneSteps(prev => step > 0 ? [...prev, step - 1] : prev)
      step++
      if (step < STEPS.length) {
        setActiveStep(step)
      } else {
        clearInterval(interval)
      }
    }, 900)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), category }),
      })

      clearInterval(interval)
      setDoneSteps(STEPS.map((_, i) => i))
      setActiveStep(-1)

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed.')

      const newCount = usage.count + 1
      saveUsage(newCount)
      setRemaining(Math.max(0, DAILY_LIMIT - newCount))
      setBrief(data)
      setAnalyzedAt(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
      setScreen('results')
    } catch (e: unknown) {
      clearInterval(interval)
      setScreen('input')
      setError(e instanceof Error ? e.message : 'Analysis failed. Try again.')
    }
  }

  function reset() {
    setScreen('input')
    setError('')
    setActiveStep(-1)
    setDoneSteps([])
  }

  const barClass: Record<Direction, string> = {
    pos: styles.barPos,
    neg: styles.barNeg,
    neu: styles.barNeu,
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>

        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3" fill="currentColor" />
              <path d="M9 2C5.13 2 2 5.13 2 9s3.13 7 7 7 7-3.13 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="14" cy="4" r="1.5" fill="#e24b4a" />
            </svg>
          </div>
          <span className={styles.logoName}>Parrot</span>
          <span className={styles.logoTag}>competitive intelligence</span>
        </div>

        {/* INPUT */}
        {screen === 'input' && (
          <div className={styles.card}>
            <div className={styles.field}>
              <label className={styles.label}>Competitor name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Linear"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
              />
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Website</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="linear.app"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Category</label>
                <select className={styles.input} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Select...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.tokenBar}>
              <div>
                <div className={styles.pips}>
                  {Array.from({ length: DAILY_LIMIT }, (_, i) => (
                    <div key={i} className={`${styles.pip} ${i < remaining ? styles.pipActive : ''}`} />
                  ))}
                </div>
                <p className={styles.tokenLabel}>
                  {remaining === 0
                    ? 'Daily limit reached — resets at midnight'
                    : `${remaining} ${remaining === 1 ? 'analysis' : 'analyses'} remaining today`}
                </p>
              </div>
            </div>

            <button
              className={styles.analyzeBtn}
              onClick={analyze}
              disabled={remaining === 0}
            >
              Analyze competitor
            </button>

            {error && <p className={styles.error}>{error}</p>}
          </div>
        )}

        {/* LOADING */}
        {screen === 'loading' && (
          <div className={styles.loadingWrap}>
            <p className={styles.loadingTitle}>Scanning {analyzedName}...</p>
            <div className={styles.stepList}>
              {STEPS.map((step, i) => (
                <div
                  key={i}
                  className={`${styles.step} ${doneSteps.includes(i) ? styles.stepDone : ''} ${activeStep === i ? styles.stepActive : ''}`}
                >
                  <div className={styles.stepDot} />
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS */}
        {screen === 'results' && brief && (
          <div>
            <div className={styles.resultsHeader}>
              <div>
                <p className={styles.resultsTitle}>{analyzedName}</p>
                <p className={styles.resultsMeta}>{analyzedUrl} · {analyzedAt}</p>
              </div>
              <button className={styles.resetBtn} onClick={reset}>← New analysis</button>
            </div>

            {/* Activity */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Recent activity</span>
              </div>
              {(brief.activity || []).length === 0
                ? <p className={styles.itemBody}>No recent activity found.</p>
                : brief.activity.map((item, i) => (
                  <div key={i} className={styles.item}>
                    <p className={styles.itemTitle}>{item.title}</p>
                    <p className={styles.itemBody}>{item.body}</p>
                    <span className={styles.sourceTag}>{item.source}</span>
                  </div>
                ))}
            </div>

            {/* Community */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Community signal</span>
              </div>
              {(brief.community || []).length === 0
                ? <p className={styles.itemBody}>No community discussions found.</p>
                : brief.community.map((item, i) => (
                  <div key={i} className={styles.item}>
                    <p className={styles.itemTitle}>{item.title}</p>
                    <p className={styles.itemBody}>{item.body}</p>
                    <span className={styles.sourceTag}>{item.source}</span>
                  </div>
                ))}
            </div>

            {/* Sentiment */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Review sentiment</span>
              </div>
              {(brief.sentiment || []).length === 0
                ? <p className={styles.itemBody}>No review data found.</p>
                : brief.sentiment.map((item, i) => (
                  <div key={i} className={styles.sentimentRow}>
                    <span className={styles.sentimentLabel}>{item.label}</span>
                    <div className={styles.sentimentBarWrap}>
                      <div
                        className={`${styles.sentimentBar} ${barClass[item.direction] || styles.barNeu}`}
                        style={{ width: `${Math.round(item.score)}%` }}
                      />
                    </div>
                    <span className={styles.sentimentPct}>{Math.round(item.score)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
