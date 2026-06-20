'use client'

import { useState, useEffect } from 'react'
import styles from './page.module.css'

const DAILY_LIMIT = 3
const STORAGE_KEY = 'parrot_usage'
const HISTORY_KEY = 'parrot_history'
const MAX_HISTORY = 5
const CACHE_MAX_AGE_DAYS = 30

type Direction = 'pos' | 'neg' | 'neu'

interface ActivityItem { title: string; body: string; source: string; url: string }
interface CommunityItem { title: string; body: string; source: string; url: string }
interface SentimentItem { label: string; score: number; direction: Direction; summary: string }
interface KeywordItem { word: string; weight: number; direction: Direction }
interface Insight { overlap: string; weakness: string; gap: string; watch: string }
interface Brief {
  activity: ActivityItem[]
  community: CommunityItem[]
  sentiment: SentimentItem[]
  keywords: KeywordItem[]
  insight?: Insight
}

interface HistoryEntry {
  name: string; url: string; sector: string; category: string
  timeRange: string; date: string; timestamp: number; brief: Brief
}

interface ComparisonBrand { name: string; url: string }
interface ComparisonStrength { theme: string; description: string }
interface ComparisonBrandResult { name: string; unique: string; topPositive: string; topNegative: string }
interface Comparison {
  sharedStrengths: ComparisonStrength[]
  sharedWeaknesses: ComparisonStrength[]
  brands: ComparisonBrandResult[]
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

function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToHistory(entry: HistoryEntry) {
  const history = getHistory()
  const filtered = history.filter(h => h.name.toLowerCase() !== entry.name.toLowerCase())
  const updated = [entry, ...filtered].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  return updated
}

function getCached(name: string): HistoryEntry | null {
  const history = getHistory()
  const entry = history.find(h => h.name.toLowerCase() === name.toLowerCase())
  if (!entry) return null
  const ageMs = Date.now() - (entry.timestamp || 0)
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays > CACHE_MAX_AGE_DAYS) return null
  return entry
}

function scoreToBarClass(score: number, s: Record<string, string>): string {
  if (score >= 65) return s.barPos
  if (score <= 35) return s.barNeg
  return s.barNeu
}

function scoreToDotClass(score: number, s: Record<string, string>): string {
  if (score >= 65) return s.dotPos
  if (score <= 35) return s.dotNeg
  return s.dotNeu
}

function keywordColor(direction: Direction): string {
  if (direction === 'pos') return '#639922'
  if (direction === 'neg') return '#e24b4a'
  return '#888780'
}

function keywordOpacity(weight: number): number { return 0.4 + (weight / 10) * 0.6 }
function keywordSize(weight: number): string { return `${Math.round(11 + (weight / 10) * 11)}px` }

function formatBriefAsText(name: string, url: string, sector: string, category: string, timeRange: string, date: string, brief: Brief): string {
  const timeLabels: Record<string, string> = { '30d': 'Last 30 days', '6m': 'Last 6 months', '12m': 'Last 12 months', 'all': 'All time' }
  const lines: string[] = []
  lines.push(`PARROT — Market Signal`)
  lines.push(`${name} · ${url} · ${sector} / ${category} · ${timeLabels[timeRange] || '6 months'} · ${date}`)
  lines.push('')
  lines.push('RECENT ACTIVITY')
  lines.push('---------------')
  for (const item of brief.activity || []) {
    lines.push(item.title); lines.push(item.body)
    lines.push(`Source: ${item.source}${item.url ? ' — ' + item.url : ''}`); lines.push('')
  }
  lines.push('COMMUNITY SIGNAL')
  lines.push('----------------')
  for (const item of brief.community || []) {
    lines.push(item.title); lines.push(item.body)
    lines.push(`Source: ${item.source}${item.url ? ' — ' + item.url : ''}`); lines.push('')
  }
  lines.push('MARKET SENTIMENT')
  lines.push('----------------')
  for (const item of brief.sentiment || []) {
    const label = item.score >= 65 ? 'Positive' : item.score <= 35 ? 'Negative' : 'Mixed'
    lines.push(`${item.label} — ${Math.round(item.score)}/100 (${label})`)
    if (item.summary) lines.push(item.summary); lines.push('')
  }
  if (brief.insight) {
    lines.push('WHAT THIS MEANS FOR YOU')
    lines.push('-----------------------')
    lines.push('Where they overlap: ' + brief.insight.overlap); lines.push('')
    lines.push('Where they are weak: ' + brief.insight.weakness); lines.push('')
    lines.push('The gap: ' + brief.insight.gap); lines.push('')
    lines.push('What to watch: ' + brief.insight.watch); lines.push('')
  }
  lines.push('---')
  lines.push('Generated by Parrot. AI-generated — verify before use.')
  return lines.join('\n')
}

const SECTOR_MAP: Record<string, string[]> = {
  'Consumer & Retail': ['E-Commerce', 'D2C Brands', 'Hyperlocal', 'Grocery', 'Fashion & Apparel', 'Beauty & Personal Care', 'Electronics & Gadgets'],
  'Fintech & Payments': ['Payments & Wallets', 'Neo-Banking', 'Lending & BNPL', 'Insurance', 'Wealth & Investing', 'Crypto'],
  'Food & Beverage': ['Food Delivery', 'Cloud Kitchens', 'QSR Chains', 'Packaged Foods', 'Beverages & D2C Food'],
  'Logistics & Supply Chain': ['Last-mile Delivery', 'Freight & B2B Logistics', 'Warehousing', 'Cross-border'],
  'Media & Entertainment': ['Streaming', 'Gaming', 'Short Video', 'Podcasts', 'News & Publishing'],
  'Health & Wellness': ['Telehealth', 'Fitness & D2C Wellness', 'Mental Health', 'Pharma & MedTech'],
  'Travel & Hospitality': ['OTAs', 'Hotels & Stays', 'Experiences', 'Corporate Travel'],
  'B2B & Enterprise SaaS': ['Developer Tools', 'Analytics', 'CRM & Sales', 'Marketing Tech', 'Project Management', 'AI / LLM'],
  'HR & Workforce': ['Job Portals', 'ATS & Recruiting', 'Payroll & HRMS', 'Gig & Staffing'],
  'Real Estate & PropTech': ['Residential', 'Commercial', 'Construction Tech', 'Property Management'],
  'EdTech': ['K-12', 'Higher Ed', 'Upskilling & Courses', 'Language Learning'],
  'Other': ['Other'],
}

const SECTORS = Object.keys(SECTOR_MAP)

const TIME_RANGES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
]

const STEPS = [
  'Reading blog and changelog',
  'Checking Reddit and Hacker News',
  'Scanning Product Hunt',
  'Pulling App Store reviews',
  'Synthesizing brief',
]

function SourceTag({ source, url, s }: { source: string; url: string; s: Record<string, string> }) {
  if (url) return <a href={url} target="_blank" rel="noopener noreferrer" className={`${s.sourceTag} ${s.sourceTagLink}`}>{source} ↗</a>
  return <span className={s.sourceTag}>{source}</span>
}

export default function Home() {
  const [screen, setScreen] = useState<'input' | 'loading' | 'results'>('input')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [sector, setSector] = useState('')
  const [category, setCategory] = useState('')
  const [timeRange, setTimeRange] = useState('6m')
  const [contextOpen, setContextOpen] = useState(false)
  const [idea, setIdea] = useState('')
  const [audience, setAudience] = useState('')
  const [edge, setEdge] = useState('')
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(DAILY_LIMIT)
  const [activeStep, setActiveStep] = useState(-1)
  const [doneSteps, setDoneSteps] = useState<number[]>([])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [analyzedName, setAnalyzedName] = useState('')
  const [analyzedUrl, setAnalyzedUrl] = useState('')
  const [analyzedAt, setAnalyzedAt] = useState('')
  const [analyzedSector, setAnalyzedSector] = useState('')
  const [analyzedCategory, setAnalyzedCategory] = useState('')
  const [analyzedTimeRange, setAnalyzedTimeRange] = useState('6m')
  const [fromCache, setFromCache] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [copied, setCopied] = useState(false)
  const [keywordFilter, setKeywordFilter] = useState<'all' | 'pos' | 'neg'>('all')
  const [activeTab, setActiveTab] = useState<'signal' | 'compare'>('signal')

  // Comparison state
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareBrands, setCompareBrands] = useState<ComparisonBrand[]>([{ name: '', url: '' }])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [comparison, setComparison] = useState<Comparison | null>(null)

  useEffect(() => {
    setRemaining(Math.max(0, DAILY_LIMIT - getUsage().count))
    setHistory(getHistory())
  }, [])

  function handleSectorChange(val: string) { setSector(val); setCategory('') }

  const hasContext = idea.trim() || audience.trim() || edge.trim()

  async function analyze() {
    setError('')
    if (!name.trim()) { setError('Enter a brand name to continue.'); return }
    if (!url.trim()) { setError('Enter the brand website.'); return }
    if (!sector) { setError('Select a sector.'); return }
    if (!category) { setError('Select a category.'); return }

    const cached = getCached(name.trim())
    if (cached) {
      setBrief(cached.brief)
      setAnalyzedName(cached.name)
      setAnalyzedUrl(cached.url)
      setAnalyzedAt(cached.date)
      setAnalyzedSector(cached.sector || '')
      setAnalyzedCategory(cached.category)
      setAnalyzedTimeRange(cached.timeRange || '6m')
      setFromCache(true)
      setComparison(null)
      setCompareOpen(false)
      setScreen('results')
      return
    }

    const usage = getUsage()
    if (usage.count >= DAILY_LIMIT) return

    setAnalyzedName(name.trim())
    setAnalyzedUrl(url.trim())
    setAnalyzedSector(sector)
    setAnalyzedCategory(category)
    setAnalyzedTimeRange(timeRange)
    setFromCache(false)
    setComparison(null)
    setCompareOpen(false)
    setScreen('loading')
    setActiveStep(0)
    setDoneSteps([])

    let step = 0
    const interval = setInterval(() => {
      setDoneSteps(prev => step > 0 ? [...prev, step - 1] : prev)
      step++
      if (step < STEPS.length) { setActiveStep(step) } else { clearInterval(interval) }
    }, 900)

    try {
      const userContext = hasContext ? { idea: idea.trim(), audience: audience.trim(), edge: edge.trim() } : null
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), sector, category, timeRange, userContext }),
      })

      clearInterval(interval)
      setDoneSteps(STEPS.map((_, i) => i))
      setActiveStep(-1)

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed.')

      const newCount = usage.count + 1
      saveUsage(newCount)
      setRemaining(Math.max(0, DAILY_LIMIT - newCount))

      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const entry: HistoryEntry = { name: name.trim(), url: url.trim(), sector, category, timeRange, date: dateStr, timestamp: Date.now(), brief: data }
      const updated = saveToHistory(entry)
      setHistory(updated)
      setBrief(data)
      setAnalyzedAt(dateStr)
      setScreen('results')
    } catch (e: unknown) {
      clearInterval(interval)
      setScreen('input')
      setError(e instanceof Error ? e.message : 'Analysis failed. Try again.')
    }
  }

  function loadFromHistory(entry: HistoryEntry) {
    setBrief(entry.brief)
    setAnalyzedName(entry.name)
    setAnalyzedUrl(entry.url)
    setAnalyzedAt(entry.date)
    setAnalyzedSector(entry.sector || '')
    setAnalyzedCategory(entry.category)
    setAnalyzedTimeRange(entry.timeRange || '6m')
    setFromCache(true)
    setComparison(null)
    setCompareOpen(false)
    setSidebarOpen(false)
    setScreen('results')
  }

  function reset() {
    setScreen('input'); setError(''); setActiveStep(-1)
    setDoneSteps([]); setSidebarOpen(false); setCopied(false)
    setComparison(null); setCompareOpen(false)
    setCompareBrands([{ name: '', url: '' }]); setActiveTab('signal')
  }

  function refreshAnalysis() {
    const history = getHistory()
    const filtered = history.filter(h => h.name.toLowerCase() !== analyzedName.toLowerCase())
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered))
    setHistory(filtered)
    setName(analyzedName); setUrl(analyzedUrl)
    setSector(analyzedSector); setCategory(analyzedCategory)
    setTimeRange(analyzedTimeRange)
    setScreen('input'); setFromCache(false); setCopied(false)
    setComparison(null); setCompareOpen(false)
  }

  async function copyBrief() {
    if (!brief) return
    const text = formatBriefAsText(analyzedName, analyzedUrl, analyzedSector, analyzedCategory, analyzedTimeRange, analyzedAt, brief)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  function updateCompareBrand(index: number, field: keyof ComparisonBrand, value: string) {
    setCompareBrands(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  function addCompareBrand() {
    if (compareBrands.length < 2) setCompareBrands(prev => [...prev, { name: '', url: '' }])
  }

  function removeCompareBrand(index: number) {
    setCompareBrands(prev => prev.filter((_, i) => i !== index))
  }

  async function runComparison() {
    setCompareError('')
    const validBrands = compareBrands.filter(b => b.name.trim() && b.url.trim())
    if (validBrands.length === 0) { setCompareError('Add at least one brand to compare.'); return }

    setCompareLoading(true)

    const brands = [
      { name: analyzedName, url: analyzedUrl, sector: analyzedSector, category: analyzedCategory, timeRange: analyzedTimeRange, cachedBrief: brief },
      ...validBrands.map(b => {
        const cached = getCached(b.name.trim())
        return {
          name: b.name.trim(),
          url: b.url.trim(),
          sector: analyzedSector,
          category: analyzedCategory,
          timeRange: analyzedTimeRange,
          cachedBrief: cached?.brief || null
        }
      })
    ]

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Comparison failed.')

      // Save newly fetched briefs to history
      if (data.fetchedBriefs) {
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        for (const fb of data.fetchedBriefs) {
          const brand = validBrands.find(b => b.name.trim() === fb.name)
          if (brand) {
            const entry: HistoryEntry = {
              name: fb.name, url: brand.url.trim(),
              sector: analyzedSector, category: analyzedCategory,
              timeRange: analyzedTimeRange, date: dateStr,
              timestamp: Date.now(), brief: fb.brief
            }
            saveToHistory(entry)
          }
        }
        setHistory(getHistory())
      }

      setComparison(data.comparison)
    } catch (e: unknown) {
      setCompareError(e instanceof Error ? e.message : 'Comparison failed.')
    } finally {
      setCompareLoading(false)
    }
  }

  const availableCategories = sector ? SECTOR_MAP[sector] || [] : []
  const timeLabel = TIME_RANGES.find(t => t.value === analyzedTimeRange)?.label || 'Last 6 months'

  return (
    <main className={styles.main}>
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Recent analyses</span>
          <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        {history.length === 0 ? <p className={styles.sidebarEmpty}>No analyses yet.</p> : (
          <div className={styles.sidebarList}>
            {history.map((entry, i) => (
              <button key={i} className={styles.sidebarItem} onClick={() => loadFromHistory(entry)}>
                <span className={styles.sidebarItemName}>{entry.name}</span>
                <span className={styles.sidebarItemMeta}>{entry.sector ? `${entry.sector} · ` : ''}{entry.category} · {entry.date}</span>
              </button>
            ))}
          </div>
        )}
        <p className={styles.sidebarFooter}>Showing up to {MAX_HISTORY} most recent · Cache valid 30 days</p>
      </div>

      <div className={screen === 'results' ? styles.containerWide : styles.container}>
        <div className={styles.logoRow}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="3" fill="currentColor" />
                <path d="M9 2C5.13 2 2 5.13 2 9s3.13 7 7 7 7-3.13 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="14" cy="4" r="1.5" fill="#e24b4a" />
              </svg>
            </div>
            <span className={styles.logoName}>Parrot</span>
            <span className={styles.logoTag}>market signal</span>
          </div>
          {history.length > 0 && (
            <button className={styles.historyBtn} onClick={() => setSidebarOpen(true)}>History ({history.length})</button>
          )}
        </div>

        {/* INPUT */}
        {screen === 'input' && (
          <div className={styles.card}>
            <div className={styles.field}>
              <label className={styles.label}>Brand name</label>
              <input className={styles.input} type="text" placeholder="e.g. Swiggy" value={name}
                onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyze()} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Website</label>
              <input className={styles.input} type="text" placeholder="swiggy.com" value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Sector</label>
                <select className={styles.input} value={sector} onChange={e => handleSectorChange(e.target.value)}>
                  <option value="">Select sector...</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Category</label>
                <select className={styles.input} value={category} onChange={e => setCategory(e.target.value)} disabled={!sector}>
                  <option value="">{sector ? 'Select category...' : 'Select sector first'}</option>
                  {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Time range</label>
              <select className={styles.input} value={timeRange} onChange={e => setTimeRange(e.target.value)}>
                {TIME_RANGES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className={styles.categoryHint}>
              <span className={styles.categoryHintIcon}>↳</span>
              Sector and category shape what signals Parrot looks for. <span className={styles.categoryHintHighlight}>Swiggy under Food Delivery</span> surfaces different intelligence than <span className={styles.categoryHintHighlight}>Swiggy under Hyperlocal</span>.
            </div>

            <button className={styles.contextToggle} onClick={() => setContextOpen(o => !o)}>
              <span>{contextOpen ? '▾' : '▸'} Add your context</span>
              <span className={styles.contextToggleHint}>{hasContext ? 'filled' : 'optional — unlocks personalised insight'}</span>
            </button>

            {contextOpen && (
              <div className={styles.contextFields}>
                <div className={styles.field}>
                  <label className={styles.label}>What are you building?</label>
                  <input className={styles.input} type="text" placeholder="e.g. A hyperlocal grocery app for working parents"
                    value={idea} onChange={e => setIdea(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Who is it for?</label>
                  <input className={styles.input} type="text" placeholder="e.g. Urban professionals aged 25-40"
                    value={audience} onChange={e => setAudience(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>What is your edge?</label>
                  <input className={styles.input} type="text" placeholder="e.g. 10-minute delivery with no minimum order"
                    value={edge} onChange={e => setEdge(e.target.value)} />
                </div>
              </div>
            )}

            <div className={styles.tokenBar}>
              <div className={styles.pips}>
                {Array.from({ length: DAILY_LIMIT }, (_, i) => (
                  <div key={i} className={`${styles.pip} ${i < remaining ? styles.pipActive : ''}`} />
                ))}
              </div>
              <p className={styles.tokenLabel}>
                {remaining === 0 ? 'Daily limit reached — resets at midnight'
                  : `${remaining} ${remaining === 1 ? 'analysis' : 'analyses'} remaining today`}
              </p>
            </div>

            <button className={styles.analyzeBtn} onClick={analyze} disabled={remaining === 0}>
              {hasContext ? 'Analyze brand + get insight' : 'Analyze brand'}
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
                <div key={i} className={`${styles.step} ${doneSteps.includes(i) ? styles.stepDone : ''} ${activeStep === i ? styles.stepActive : ''}`}>
                  <div className={styles.stepDot} />{step}
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
                <div className={styles.resultsMetaRow}>
                  <p className={styles.resultsMeta}>{analyzedUrl} · {analyzedAt}{analyzedSector ? ` · ${analyzedSector}` : ''} · {analyzedCategory} · {timeLabel}</p>
                  {fromCache && (
                    <span className={styles.cacheTag}>
                      Cached · <button className={styles.refreshLink} onClick={refreshAnalysis}>Refresh</button>
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.resultsActions}>
                <button className={`${styles.resetBtn} ${copied ? styles.copiedBtn : ''}`} onClick={copyBrief}>
                  {copied ? 'Copied ✓' : 'Copy brief'}
                </button>
                {history.length > 0 && <button className={styles.resetBtn} onClick={() => setSidebarOpen(true)}>History</button>}
                <button className={styles.resetBtn} onClick={reset}>← New</button>
              </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'signal' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('signal')}
              >
                Market signal
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'compare' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('compare')}
              >
                Compare brands
                {comparison && <span className={styles.tabBadge}>✓</span>}
              </button>
            </div>

            {activeTab === 'signal' && (
            <div>
            <div className={styles.panelGrid}>
              <div className={styles.panelLeft}>
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHead}><span className={styles.sectionLabel}>Recent activity</span></div>
                  {(brief.activity || []).length === 0 ? <p className={styles.itemBody}>No recent activity found.</p>
                    : brief.activity.map((item, i) => (
                      <div key={i} className={styles.item}>
                        <p className={styles.itemTitle}>{item.title}</p>
                        <p className={styles.itemBody}>{item.body}</p>
                        <SourceTag source={item.source} url={item.url} s={styles} />
                      </div>
                    ))}
                </div>
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHead}><span className={styles.sectionLabel}>Community signal</span></div>
                  {(brief.community || []).length === 0 ? <p className={styles.itemBody}>No community discussions found.</p>
                    : brief.community.map((item, i) => (
                      <div key={i} className={styles.item}>
                        <p className={styles.itemTitle}>{item.title}</p>
                        <p className={styles.itemBody}>{item.body}</p>
                        <SourceTag source={item.source} url={item.url} s={styles} />
                      </div>
                    ))}
                </div>
              </div>

              <div className={styles.panelRight}>
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionLabel}>Market sentiment</span>
                    <span className={styles.sectionSubLabel}>Score = satisfaction (100 = users love it)</span>
                  </div>
                  {(brief.sentiment || []).length === 0 ? <p className={styles.itemBody}>No review data found.</p>
                    : brief.sentiment.map((item, i) => (
                      <div key={i} className={styles.sentimentItem}>
                        <div className={styles.sentimentTop}>
                          <div className={styles.sentimentMeta}>
                            <span className={`${styles.sentimentDot} ${scoreToDotClass(item.score, styles)}`} />
                            <span className={styles.sentimentLabel}>{item.label}</span>
                          </div>
                          <span className={styles.sentimentPct}>{Math.round(item.score)}</span>
                        </div>
                        <div className={styles.sentimentBarWrap}>
                          <div className={`${styles.sentimentBar} ${scoreToBarClass(item.score, styles)}`}
                            style={{ width: `${Math.round(item.score)}%` }} />
                        </div>
                        {item.summary && <p className={styles.sentimentSummary}>{item.summary}</p>}
                      </div>
                    ))}
                </div>

                {(brief.keywords || []).length > 0 && (
                  <div className={styles.sectionCard}>
                    <div className={styles.sectionHead}>
                      <span className={styles.sectionLabel}>Signal keywords</span>
                      <span className={styles.sectionSubLabel}>size = frequency · colour = sentiment</span>
                    </div>
                    <div className={styles.filterRow}>
                      {(['all', 'pos', 'neg'] as const).map(f => (
                        <button key={f}
                          className={`${styles.filterBtn} ${keywordFilter === f ? styles.filterBtnActive : ''} ${f === 'pos' ? styles.filterBtnPos : f === 'neg' ? styles.filterBtnNeg : ''}`}
                          onClick={() => setKeywordFilter(f)}>
                          {f === 'all' ? 'All' : f === 'pos' ? '● Positive' : '● Negative'}
                        </button>
                      ))}
                    </div>
                    <div className={styles.wordCloud}>
                      {brief.keywords.map((kw, i) => {
                        const isActive = keywordFilter === 'all' || kw.direction === keywordFilter
                        return (
                          <span key={i} className={styles.keyword} style={{
                            fontSize: keywordSize(kw.weight),
                            color: keywordColor(kw.direction),
                            opacity: isActive ? keywordOpacity(kw.weight) : 0.1,
                            transition: 'opacity 0.2s ease',
                          }}>{kw.word}</span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Insight panel */}
            {brief.insight && (
              <div className={styles.insightCard}>
                <div className={styles.insightHeader}>
                  <span className={styles.insightTitle}>What this means for you</span>
                  <span className={styles.insightModel}>gemini flash lite</span>
                </div>
                <div className={styles.insightGrid}>
                  <div className={styles.insightItem}>
                    <p className={styles.insightItemLabel}>Where they overlap</p>
                    <p className={styles.insightItemBody}>{brief.insight.overlap}</p>
                  </div>
                  <div className={styles.insightItem}>
                    <p className={styles.insightItemLabel}>Where they are weak</p>
                    <p className={styles.insightItemBody}>{brief.insight.weakness}</p>
                  </div>
                  <div className={styles.insightItem}>
                    <p className={styles.insightItemLabel}>The gap</p>
                    <p className={styles.insightItemBody}>{brief.insight.gap}</p>
                  </div>
                  <div className={styles.insightItem}>
                    <p className={styles.insightItemLabel}>What to watch</p>
                    <p className={styles.insightItemBody}>{brief.insight.watch}</p>
                  </div>
                </div>
              </div>
            )}
            </div>
            )}

            {/* Compare tab */}
            {activeTab === 'compare' && (
            <div className={styles.compareTab}>
              <div className={styles.compareFields}>
                <p className={styles.compareTabHint}>Add 1-2 brands from the same sector and category to compare against <strong>{analyzedName}</strong>.</p>

              <div>
                  {compareBrands.map((brand, i) => (
                    <div key={i} className={styles.compareBrandRow}>
                      <div className={styles.compareBrandInputs}>
                        <input className={styles.input} type="text" placeholder={`Brand ${i + 2} name`}
                          value={brand.name} onChange={e => updateCompareBrand(i, 'name', e.target.value)} />
                        <input className={styles.input} type="text" placeholder="website.com"
                          value={brand.url} onChange={e => updateCompareBrand(i, 'url', e.target.value)} />
                      </div>
                      {compareBrands.length > 1 && (
                        <button className={styles.removeBtn} onClick={() => removeCompareBrand(i)}>✕</button>
                      )}
                    </div>
                  ))}

                  {compareBrands.length < 2 && (
                    <button className={styles.addBrandBtn} onClick={addCompareBrand}>+ Add another brand</button>
                  )}

                  <div className={styles.compareHint}>
                    Sector and category locked to <strong>{analyzedSector} · {analyzedCategory}</strong>
                  </div>

                  <button className={styles.analyzeBtn} onClick={runComparison} disabled={compareLoading}>
                    {compareLoading ? 'Comparing...' : 'Run comparison'}
                  </button>

                  {compareError && <p className={styles.error}>{compareError}</p>}
                </div>

              {/* Comparison results */}
              {comparison && (
                <div className={styles.comparisonResults}>
                  <div className={styles.comparisonGrid}>
                    <div className={styles.sectionCard}>
                      <div className={styles.sectionHead}>
                        <span className={styles.sectionLabel}>Shared strengths</span>
                        <span className={styles.sectionSubLabel}>what the whole category does well</span>
                      </div>
                      {comparison.sharedStrengths.map((item, i) => (
                        <div key={i} className={styles.item}>
                          <p className={styles.itemTitle}>{item.theme}</p>
                          <p className={styles.itemBody}>{item.description}</p>
                        </div>
                      ))}
                    </div>

                    <div className={styles.sectionCard}>
                      <div className={styles.sectionHead}>
                        <span className={styles.sectionLabel}>Category gap</span>
                        <span className={styles.sectionSubLabel}>complaints nobody has fixed</span>
                      </div>
                      {comparison.sharedWeaknesses.map((item, i) => (
                        <div key={i} className={styles.item}>
                          <p className={styles.itemTitle}>{item.theme}</p>
                          <p className={styles.itemBody}>{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.brandCompareGrid}>
                    {comparison.brands.map((brand, i) => (
                      <div key={i} className={styles.sectionCard}>
                        <div className={styles.sectionHead}>
                          <span className={styles.sectionLabel}>{brand.name}</span>
                        </div>
                        <div className={styles.brandCompareItem}>
                          <p className={styles.brandCompareLabel} style={{ color: '#639922' }}>What sets them apart</p>
                          <p className={styles.itemBody}>{brand.unique}</p>
                        </div>
                        <div className={styles.brandCompareItem}>
                          <p className={styles.brandCompareLabel} style={{ color: '#639922' }}>Users love</p>
                          <p className={styles.itemBody}>{brand.topPositive}</p>
                        </div>
                        <div className={styles.brandCompareItem}>
                          <p className={styles.brandCompareLabel} style={{ color: '#e24b4a' }}>Users complain about</p>
                          <p className={styles.itemBody}>{brand.topNegative}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            <div className={styles.footer}>
              <p className={styles.footerText}>Sentiment and signals reflect publicly available user opinions and community discussions — not the views of Parrot or its creators.</p>
              <p className={styles.footerText}>This analysis is generated by AI and may contain inaccuracies. Verify critical information independently before making decisions.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
