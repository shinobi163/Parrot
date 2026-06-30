type LLMOptions = {
  useSearch?: boolean
  temperature?: number
  maxOutputTokens?: number
}

type LLMResult = {
  text: string
}

const DEFAULT_TEMPERATURE = 0.1
const DEFAULT_MAX_TOKENS = 1500

export async function callLLM(prompt: string, options?: LLMOptions): Promise<LLMResult> {
  const provider = process.env.LLM_PROVIDER || 'gemini'

  if (provider === 'gemini') {
    return callGemini(prompt, options)
  }

  throw new Error(`Unsupported LLM provider: ${provider}`)
}

async function callGemini(prompt: string, options?: LLMOptions): Promise<LLMResult> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: options?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    },
  }

  if (options?.useSearch) {
    body.tools = [{ google_search: {} }]
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    const errMsg = data.error?.message || 'Gemini API error'
    throw new Error(errMsg)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('No text in Gemini response')
  }

  return { text }
}

// Strips citation tags Gemini sometimes injects when search grounding is used
export function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, '').trim()
}

// Extracts the first valid JSON object from a raw LLM response,
// stripping markdown code fences if present
export function extractJSON<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON object found in LLM response')
  }
  return JSON.parse(match[0]) as T
}