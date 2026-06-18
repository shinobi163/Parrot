# Parrot

Competitive intelligence, on demand. Enter a competitor, get a structured brief covering recent activity, community signal, and review sentiment.

## Setup

```bash
npm install
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=your_key_here
```

Get a key at [console.anthropic.com](https://console.anthropic.com).

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
npx vercel
```

Set `ANTHROPIC_API_KEY` as an environment variable in the Vercel dashboard under Project → Settings → Environment Variables.

## Rate limiting

3 analyses per browser per day, tracked in `localStorage`. No backend or database required for MVP.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Anthropic API with web search tool
