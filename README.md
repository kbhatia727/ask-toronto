# Ask Toronto — AI Agent over Toronto Open Data

Natural-language interface over the City of Toronto Open Data Portal. You ask a
question in plain English; an AI agent picks the right dataset, calls the Toronto
CKAN API as a tool, and returns a **grounded** answer with a chart or map.

> "Which neighbourhood had the most break-ins in 2024?"
> → *West Humber-Clairville, with 155 reported incidents.* (+ ranked bar chart)

The app and databases run locally; LLM inference uses free cloud tiers
(Groq for chat, Google Gemini for embeddings). New to the project? See the
beginner-friendly **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)**.

---

## Screenshots

> Place images in `docs/screenshots/` (see that folder's README). They render here:

| Grounded answer (chart + choropleth + source chips) | Clear error handling |
|---|---|
| ![Answer with chart and crime map](docs/screenshots/answer.png) | ![Daily limit message](docs/screenshots/error.png) |

---

## Architecture

Full diagrams (system, router pattern, request lifecycle, infrastructure) render on
GitHub in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. The system overview:

```mermaid
flowchart TD
    User([User question]) --> UI[Browser: chat + charts + map]
    UI -->|POST /api/chat| Route[Next.js route handler]
    Route --> Embed[1 - Embed question] -->|gemini-embedding-001| Gemini[(Gemini)]
    Embed --> RAG[2 - Match dataset] -->|nearest vector| Qdrant[(Qdrant)]
    RAG --> Agent[3 - Router agent: ONE tool] -->|llama-3.3-70b| Groq[(Groq)]
    Agent --> Tool[4 - Dataset tool] -->|live fetch| CKAN[(Toronto CKAN)]
    Tool -->|cache + history| PG[(PostgreSQL)]
    Tool -->|answer + rows + geoJson| Route --> UI
    classDef ext fill:#eef,stroke:#557;
    class Gemini,Groq,Qdrant,PG,CKAN ext;
```

**The router pattern is the core design choice:** RAG selects a single dataset
first, and the agent is handed *only that dataset's tool*. This keeps tool calls
focused and answers accurate, instead of dumping all six tools on the model.

### Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 (strict) |
| Framework | Next.js (App Router) + React |
| AI orchestration | Vercel AI SDK v6 (`ai`) |
| Model provider | `@ai-sdk/google` — `gemini-2.5-flash` (chat), `gemini-embedding-001` (embeddings) |
| Fallback | `@ai-sdk/groq` — `llama-3.3-70b-versatile` (one-line swap) |
| Vector DB | Qdrant (Docker) |
| Relational DB | PostgreSQL 16 (Docker) — plain SQL via `pg`, no ORM |
| Charts / Maps | Recharts / MapLibre GL + OpenStreetMap tiles (no API key) |
| Validation | Zod (all tool inputs/outputs) |
| Data | City of Toronto CKAN Datastore API |

---

## Datasets (6)

| Dataset | Tool | Example question |
|---|---|---|
| Neighbourhood Crime Rates | `getCrimeData` | "Most break-ins in 2024?" |
| TTC Subway Delays | `getTtcDelays` | "Delays on the Yonge-University line?" |
| Parks & Recreation Facilities | `getSplashPads` | "Find a pool near me" |
| Building Permits | `getBuildingPermits` | "Recent demolition permits?" |
| Cycling Network | `getCyclingNetwork` | "Bike lanes on Bloor Street" |
| Dinesafe Inspections | `getDinesafe` | "Restaurants closed by inspections?" |

---

## Setup

### 1. Prerequisites
- Docker Desktop (for Postgres + Qdrant)
- Node.js 20+
- A free Google AI Studio API key — https://aistudio.google.com/apikey
  (a key beginning with `AIza...`; no credit card)

### 2. Environment
Create `.env.local`:
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIza...your_key...
QDRANT_URL=http://localhost:6333
DATABASE_URL=postgresql://toronto:toronto@localhost:5432/torontoai
```

### 3. Run
```bash
docker compose up -d            # start Postgres + Qdrant
npm install
npx tsx scripts/ingest_catalog.ts   # embed the dataset catalog into Qdrant (once)
npm run dev                     # http://localhost:3000
```

### 4. Evals (optional)
```bash
npx tsx --env-file=.env.local scripts/run_evals.ts
```

---

## How it works (the AI decisions)

- **Embeddings:** `gemini-embedding-001` requested at `outputDimensionality: 768`
  to match the Qdrant collection. The dataset catalog (`data/dataset_catalog.json`)
  is embedded once into Qdrant by `scripts/ingest_catalog.ts`.
- **Retrieval:** `lib/rag.ts` embeds the question and returns the top dataset match.
- **Routing:** `lib/agent.ts` builds a `ToolLoopAgent` with **exactly one** tool —
  the one belonging to the matched dataset — plus a tailored system prompt.
- **Grounding:** every tool returns Zod-validated `{ rows, metadata }` (geospatial
  tools add `geoJson`). The system prompt forbids inventing numbers; the agent must
  cite tool output. If a tool returns no rows, the agent says so.
- **Caching:** `lib/ckan.ts` checks the Postgres `ckan_cache` table before calling
  CKAN. TTLs follow update cadence — TTC 15 min, parks 7 days, others 24 h. A repeat
  query drops from ~350 ms (network) to ~10 ms (cache hit).
- **History:** every question + answer + dataset is logged to `query_history`.

### Notable real-world constraints handled
- Toronto **disabled** the `datastore_search_sql` endpoint (403/404). All reads go
  through `datastore_search` with `filters`/`q`; aggregation is done in TypeScript.
- CKAN resource IDs are resolved at runtime via `package_show` (and cached), so the
  app survives dataset re-publishes.

---

## Evals

The harness (`scripts/run_evals.ts`) runs a 30-question golden set
(`evals/benchmark_questions.json`, 5 per dataset) and scores four metrics per
question, persisting to the `eval_results` table:

1. **Retrieval correct** — did RAG pick the right dataset?
2. **Tool correct** — did the agent call the expected tool?
3. **Numeric grounding** — do the numbers in the answer appear in the tool output
   (i.e. no hallucinated figures)?
4. **LLM quality (1–5)** — LLM-as-judge on answer quality.

### Before → after

The project originally targeted a local Ollama model (`qwen3:1.7b`). Switching the
provider layer to Google Gemini (`gemini-2.5-flash` + `gemini-embedding-001`) — with
no change to the router, tools, or data layer — improved both reliability and quality:

| Metric | Local (qwen3:1.7b) | Gemini 2.5 Flash |
|---|---|---|
| Runs without GPU / large download | ❌ 5 GB model, slow | ✅ API, instant |
| Retrieval accuracy | _n/a (embeddings unavailable offline)_ | **<RETRIEVAL>%** |
| Tool-call accuracy | unreliable on a 1.7B model | **<TOOL>%** |
| Numeric grounding | frequent hallucinated numbers | **<NUMERIC>%** |
| Avg answer quality | — | **<QUALITY>/5** |

_Run `scripts/run_evals.ts` to reproduce; latest numbers are stored in `eval_results`._

---

## Project layout

```
app/
  page.tsx                 chat UI
  components/              Chart, MapView, ToolVisual
  api/chat/route.ts        RAG → router agent → stream
lib/
  llm.ts                   Google chat + embeddings client
  rag.ts                   embed question, query Qdrant
  agent.ts                 router pattern (one tool per question)
  ckan.ts                  CKAN client + Postgres cache
  db.ts                    pg pool + schema
  tools/                   6 dataset tools (Zod-validated)
data/dataset_catalog.json  the 6 datasets
scripts/
  ingest_catalog.ts        embed catalog → Qdrant
  run_evals.ts             eval harness
evals/benchmark_questions.json
```
