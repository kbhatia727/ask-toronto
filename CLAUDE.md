# Ask Toronto — AI Agent

Natural-language interface over the City of Toronto Open Data Portal.
User asks a question → AI agent picks the right dataset → calls the Toronto CKAN API
as a tool → returns a grounded answer + chart/map.

**App runs locally. LLM inference via Google AI Studio free tier (no credit card required).**

---

## Tech Stack (LOCKED — do not deviate)

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS + TypeScript 5.x + npm |
| Framework | Next.js (latest stable, App Router) + React |
| Styling | Tailwind CSS |
| Chat UI streaming | `@ai-sdk/react` `useChat` hook |
| Charts | Recharts |
| Maps | MapLibre GL JS + OpenStreetMap raster tiles (no API key) |
| AI orchestration | Vercel AI SDK v6 (`ai`) |
| Google provider | `@ai-sdk/google` |
| Schemas/validation | Zod (for all tool inputs, outputs, and structured output) |
| Chat/agent model | `gemini-2.5-flash` via Google AI Studio (free tier) |
| Embeddings model | `gemini-embedding-001` via Google AI Studio (output 768 dims, free tier) |
| Vector DB | Qdrant (Docker, `http://localhost:6333`) |
| Relational DB | PostgreSQL 16 (Docker, port 5432) |
| DB client | `pg` (node-postgres) + plain SQL — NO ORM |
| Data source | City of Toronto CKAN Datastore API |

**Core packages:**
```bash
npm i ai @ai-sdk/google @ai-sdk/react zod recharts maplibre-gl pg @qdrant/js-client-rest
npm i -D typescript @types/node @types/pg tsx
```

---

## Architecture

```
Browser
  └── Next.js App (chat + map + charts)
        └── POST /api/chat
              └── Node route handler (TypeScript)
                    1. Embed question  →  Google: gemini-embedding-001 (768 dims)
                    2. RAG             →  Qdrant  →  matching dataset(s)
                    3. Agent           →  AI SDK v6 + @ai-sdk/google + gemini-2.5-flash
                         plan → call tool → observe → answer
                    4. Tools           →  CKAN API  →  Postgres cache
                    5. Return          →  { answer, chartData, mapData }
                          │
                    ┌─────┼──────────┐
                 Google   Qdrant  Postgres
                 AI API              │
                              Toronto CKAN API
```

---

## Folder Structure

```
toronto-ai-agent/
├─ CLAUDE.md                    ← you are here
├─ docker-compose.yml
├─ .env.local
├─ app/
│  ├─ page.tsx                  ← chat UI + map + charts
│  ├─ globals.css
│  └─ api/
│     ├─ chat/route.ts          ← main agent endpoint
│     ├─ datasets/route.ts      ← list available datasets
│     └─ history/route.ts       ← query history
├─ lib/
│  ├─ llm.ts                    ← Google AI chat + embeddings client
│  ├─ rag.ts                    ← embed question, query Qdrant, return dataset match
│  ├─ agent.ts                  ← AI SDK tool-calling loop
│  ├─ db.ts                     ← Postgres pool (pg)
│  ├─ ckan.ts                   ← CKAN API client + Postgres cache layer
│  └─ tools/
│     ├─ getCrimeData.ts
│     ├─ getTtcDelays.ts
│     ├─ getSplashPads.ts
│     ├─ getBuildingPermits.ts
│     ├─ getCyclingNetwork.ts
│     └─ getDinesafe.ts
├─ data/
│  └─ dataset_catalog.json
├─ scripts/
│  ├─ ingest_catalog.ts         ← embed catalog → Qdrant (run once)
│  └─ run_evals.ts              ← eval harness
└─ evals/
   └─ benchmark_questions.json  ← ~30 golden Q&A pairs
```

---

## Dataset Catalog (6 datasets)

| Dataset ID | Name | Trigger keywords |
|---|---|---|
| `neighbourhood-crime-rates` | Neighbourhood Crime Rates | break-in, robbery, assault, crime, safety, neighbourhood |
| `ttc-delay-data` | TTC Delay Data | delay, subway, bus, transit, TTC, route |
| `parks-splash-pads` | Parks & Splash Pads | splash pad, pool, park, swimming, near me |
| `building-permits` | Building Permits | permit, construction, development, zoning |
| `cycling-network` | Cycling Network | bike lane, cycling, bicycle, infrastructure |
| `dinesafe` | Dinesafe Restaurant Inspections | restaurant, food, inspection, health, dine |

**CKAN base URL:** `https://ckan0.cf.opendata.inter.prod-toronto.ca`
**CKAN endpoints:**
- `GET /api/3/action/package_show?id={slug}` → find the `datastore_active` resource
- `GET /api/3/action/datastore_search?resource_id={id}&filters={json}&q={text}&limit={n}`
- ⚠️ `datastore_search_sql` is **DISABLED** by Toronto (returns 403/404). Do not use it.
  All reads go through `datastore_search` with `filters` / `q`. Resource ids are
  resolved at runtime via `package_show` and cached (see `lib/ckan.ts`).

---

## Environment Variables (.env.local)

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_key_from_aistudio.google.com
QDRANT_URL=http://localhost:6333
DATABASE_URL=postgresql://toronto:toronto@localhost:5432/torontoai
```

Get your free API key at: https://aistudio.google.com — sign in with Google, click "Get API key". No credit card.

---

## docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: toronto
      POSTGRES_PASSWORD: toronto
      POSTGRES_DB: torontoai
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrantdata:/qdrant/storage"]
volumes:
  pgdata:
  qdrantdata:
```

No Ollama — LLM inference handled by Google AI Studio API.

---

## Local Dev Commands

```bash
# Start infra (Postgres + Qdrant)
docker compose up -d

# Install dependencies
npm install

# Start dev server
npm run dev

# Ingest dataset catalog into Qdrant (run once after infra is up)
npx tsx scripts/ingest_catalog.ts

# Run eval harness
npx tsx scripts/run_evals.ts
```

**Model note:** This Google project's free tier only has quota on the 2.5 model lineup —
`gemini-2.0-flash` returns `limit: 0`. Use `gemini-2.5-flash` for chat and
`gemini-embedding-001` (request `outputDimensionality: 768` to match Qdrant) for embeddings.

**Rate limit tip:** On heavy eval days, swap `gemini-2.5-flash` for `llama-3.3-70b-versatile`
via `@ai-sdk/groq` (free, 14,400 req/day). It's a one-line model change in `lib/llm.ts` —
keep both providers installed. Note: Groq has no embeddings API, so embeddings stay on Gemini.

---

## Postgres Schema

```sql
-- Query history
CREATE TABLE IF NOT EXISTS query_history (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  response TEXT,
  dataset_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dataset metadata (mirrors dataset_catalog.json, queryable)
CREATE TABLE IF NOT EXISTS dataset_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  ckan_resource_id TEXT,
  tags TEXT[]
);

-- CKAN API cache
CREATE TABLE IF NOT EXISTS ckan_cache (
  cache_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Eval results
CREATE TABLE IF NOT EXISTS eval_results (
  id SERIAL PRIMARY KEY,
  question_id TEXT,
  question TEXT,
  expected_dataset TEXT,
  actual_dataset TEXT,
  retrieval_correct BOOLEAN,
  tool_correct BOOLEAN,
  numeric_correct BOOLEAN,
  llm_quality_score INTEGER,  -- 1-5, LLM-as-judge
  run_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Coding Conventions (strictly follow)

**TypeScript**
- `strict: true` + `noUncheckedIndexedAccess: true` in tsconfig — no exceptions
- Never use `any`. Use `unknown` then narrow, or define a proper type.
- All async functions must handle errors with try/catch — no ignored promises.

**AI / agent**
- **Router pattern (REQUIRED):** RAG picks the dataset first → pass ONLY that dataset's tool to the agent. Do NOT pass all tools at once. Keeps the agent focused and answers more accurate.
- Tool functions return structured, Zod-validated data.
- The final LLM answer MUST be grounded in tool output — never let the model invent numbers or facts. If a tool returns no data, say so.
- Keep tool schemas explicit and minimal: clear field names = better tool call arguments.

**DB**
- Plain SQL via `pg` — no ORM, no query builder.
- Always use parameterized queries (`$1, $2` etc.) — never string-concatenate SQL.

**CKAN cache**
- Check Postgres cache before calling CKAN.
- Crime, permits, cycling datasets update monthly → cache TTL 24h.
- Splash pad locations rarely change → cache TTL 7d.
- TTC delays update frequently → cache TTL 15min or fetch live.

**Tools**
- Each tool file exports one function: `async function getXxx(args: z.infer<typeof XxxArgs>): Promise<XxxResult>`
- Always return `{ rows: ..., metadata: { dataset, fetchedAt, total } }`
- Geospatial tools should return `{ rows, geoJson }` for MapLibre rendering.

---

## AI SDK v6 + @ai-sdk/google Pattern

```typescript
import { google } from '@ai-sdk/google'
import { generateText, embed } from 'ai'
import { z } from 'zod'

// Chat with tool calling (router pattern)
const { text } = await generateText({
  model: google('gemini-2.5-flash'),
  system: 'You are a Toronto civic data analyst...',
  messages,
  tools: { [selectedTool.name]: selectedTool },  // only one tool, pre-selected by RAG
  maxSteps: 5,
})

// Embeddings — request 768 dims to match the Qdrant collection
const { embedding } = await embed({
  model: google.textEmbeddingModel('gemini-embedding-001'),
  value: text,
  providerOptions: { google: { outputDimensionality: 768 } },
})
```

**Fallback to Groq on heavy eval days:**
```typescript
import { createGroq } from '@ai-sdk/groq'
const groq = createGroq()
const model = groq('llama-3.3-70b-versatile')  // drop-in replacement
```

---

## Qdrant Client Pattern

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL })

// Create collection (run once)
await qdrant.createCollection('datasets', {
  vectors: { size: 768, distance: 'Cosine' }  // gemini-embedding-001 with outputDimensionality: 768
})

// Upsert
await qdrant.upsert('datasets', {
  points: [{ id: i, vector: embedding, payload: { id, name, description } }]
})

// Search
const results = await qdrant.search('datasets', {
  vector: queryEmbedding,
  limit: 2,
  with_payload: true,
})
```

---

## Eval Design

**Golden set structure** (`evals/benchmark_questions.json`):
```json
[
  {
    "id": "q01",
    "question": "Which neighbourhood had the most break-ins in 2024?",
    "expected_dataset": "neighbourhood-crime-rates",
    "expected_tool": "getCrimeData",
    "expected_answer_contains": ["West Humber-Clairville"],
    "expected_number": 87
  }
]
```

**Metrics to score (per question):**
1. `retrieval_correct` — did RAG pick the right dataset? (boolean)
2. `tool_correct` — did the agent call the right tool with sane args? (boolean)
3. `numeric_correct` — does the returned number match the raw API? (boolean)
4. `llm_quality_score` — 1-5, LLM-as-judge: feed question + expected + actual to the model

**Target:** retrieval accuracy ≥ 90% on the golden set before calling the project done.

---

## Build Phases

| Phase | Weeks | Goal |
|---|---|---|
| 1 | 1–2 | Scaffold + LLM call + CKAN fetch |
| 2 | 3–4 | RAG — embed catalog, Qdrant, retrieval |
| 3 | 5–6 | Agent + tools + UI (charts + maps) |
| 4 | 7–8 | Evals + Langfuse + polish + README |

**Current phase: Phase 4 — Evals + polish.** Done so far:
- Phase 1: scaffold, Gemini LLM call, CKAN fetch layer (`lib/db.ts` + `lib/ckan.ts`, Postgres caching).
- Phase 2: RAG — catalog embedded into Qdrant (`scripts/ingest_catalog.ts`), retrieval router
  (`lib/rag.ts`). Retrieval accuracy 6/6 (100%) on smoke test, above the 90% target.
- Phase 3: 6 tools (`lib/tools/*`, Zod-validated, geospatial ones return GeoJSON), router agent
  (`lib/agent.ts`, passes ONLY the RAG-selected tool), wired into `/api/chat` with query_history
  logging. UI renders Recharts bar charts + MapLibre maps from tool outputs
  (`app/components/{Chart,MapView,ToolVisual}.tsx`). Verified live in-browser: crime→chart,
  dinesafe→map, both grounded in real CKAN data.
- Phase 4 enhancements (hackathon-inspired, see "Enhancements" below): source-attribution chips,
  retrieval-confidence badge, and a crime choropleth map. All verified live in-browser.

---

## Enhancements (hackathon-inspired)

Three features adapted from the Toronto Spark Hackathon projects, chosen because they fit the
cloud/Gemini/RAG architecture (no GPU/NVIDIA dependency) and are additive — they don't touch the
router pattern or the existing 6 tools.

**1. Source-attribution chips** (grounding transparency)
- Every tool's `metadata` now carries `resourceId` and `cacheHit` (live vs. cached).
- Plumbing: `cachedFetch` (lib/ckan.ts) returns `{ data, cacheHit }`; `datastoreSearch` surfaces
  `cacheHit` + `resourceId`; `metadata()` (lib/tools/shared.ts) accepts them; all 6 tools pass them.
- UI: `ToolVisual` renders a chip row — dataset, rows returned/total, live/cached, timestamp, CKAN id.

**2. Retrieval-confidence badge**
- `route.ts` uses `createUIMessageStream` and writes a custom `data-routing` part
  `{ id, name, score, tool }` before merging `createAgentUIStream(...)` (history logging preserved
  via that stream's `onFinish`).
- UI: `page.tsx` renders "Matched: <dataset> · <score>" from the `data-routing` part.

**3. Crime choropleth map**
- `getCrimeData` returns neighbourhood polygon GeoJSON (all 158 areas) shaded by the queried
  offence/year `value`; `ToolVisual` shows the ranked bar chart AND the choropleth for crime.
- `MapView` gained a value-shaded fill layer + legend + polygon-aware bounds fitting; existing
  point/line layers untouched.
- `geometryFeatureCollection` (lib/tools/shared.ts) rounds coordinates to 5 decimals (~1m) to keep
  GeoJSON payloads small (Toronto ships 13-decimal coords).

**Skipped:** adding a 311 dataset — all Toronto 311 data is download-only ZIP (no datastore-active
resource), so it can't be queried via `datastore_search`. GPU-bound hackathon features (local
Nemotron/RAPIDS/cuOpt/NIM, 3D digital twins) are out of scope for this cloud stack.

---

## Definition of Done

- [ ] Runs with `docker compose up -d && npm run dev` — no other setup
- [ ] All 6 example questions answered correctly, grounded in real data
- [ ] RAG retrieval accuracy ≥ 90% on golden set
- [ ] Eval harness runs with `npx tsx scripts/run_evals.ts`
- [ ] README explains architecture + shows before/after eval improvement
- [ ] You can explain every AI decision in the codebase without notes
