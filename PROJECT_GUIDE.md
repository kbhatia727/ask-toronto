# Ask Toronto — The Complete Project Guide

> A from-scratch, plain-English explanation of the whole project: what it is, how
> it's built, **why** each piece exists, every term defined, and how to talk about
> it in an interview. No prior AI knowledge assumed.

---

## Table of Contents
1. [What is this project? (the elevator pitch)](#1-what-is-this-project)
2. [The problem it solves](#2-the-problem-it-solves)
3. [How it works — the journey of one question](#3-how-it-works)
4. [The architecture (with diagram)](#4-the-architecture)
5. [Every technology explained — what & why](#5-every-technology-explained)
6. [Why Docker? (explained simply)](#6-why-docker)
7. [Core AI concepts in plain English](#7-core-ai-concepts)
8. [The "router pattern" — the heart of the design](#8-the-router-pattern)
9. [The 6 datasets and their tools](#9-the-6-datasets)
10. [The trust features we added](#10-the-trust-features)
11. [The model journey (Ollama → Gemini → Groq)](#11-the-model-journey)
12. [The GPU restriction — what the hackathon did that we couldn't](#12-the-gpu-restriction)
13. [What could be added in the future](#13-future-additions)
14. [How to run and test it](#14-how-to-run-and-test)
15. [Glossary — every term defined](#15-glossary)
16. [Interview questions & answers](#16-interview-qa)
17. [Known limitations & trade-offs](#17-limitations)

---

## 1. What is this project?

**Ask Toronto is a website where you type a question about the city of Toronto in
plain English, and an AI answers it using real government data — with a chart or
map to back it up.**

Example:
> **You:** "Which neighbourhood had the most break-ins in 2024?"
> **App:** "West Humber-Clairville, with 155 reported break-ins." *(plus a bar chart
> ranking neighbourhoods and a colour-shaded map of the city)*

Think of it as a **smart translator** sitting between a normal person and a giant pile
of government spreadsheets. You ask like you'd ask a friend; it does the digging.

---

## 2. The problem it solves

The City of Toronto publishes **hundreds of open (public) datasets** — crime, transit
delays, restaurant inspections, bike lanes, building permits, parks, and more. In
theory anyone can use this data. In practice, a regular person **can't**, because:

- You'd need to know *which* dataset answers your question.
- You'd have to download massive spreadsheets.
- You'd have to know how to filter, sort, and read raw data tables.

**Ask Toronto removes every one of those barriers.** You ask a question; it picks the
right dataset, fetches the live data, calculates the answer, and shows it visually.

> **One-liner for an interviewer:** *"It's a natural-language front door to Toronto's
> open data. The data was always public — I made it actually usable."*

---

## 3. How it works

Picture a very fast, very honest librarian. When you ask a question, five things happen:

1. **You ask a question.** e.g. *"Where are the dirtiest restaurants?"*
2. **It picks the right filing cabinet.** Out of 6 topics, it decides this is a
   *restaurant inspections* question. *(This is the **retrieval / RAG** step.)*
3. **It opens only that one drawer.** It hands the AI exactly one tool — the restaurant
   tool — not all six. *(This is the **router pattern**.)*
4. **It reads the real records.** It calls Toronto's official data service for live data,
   and remembers recent answers so repeats are instant. *(This is **caching**.)*
5. **It answers, grounded in the data.** It writes a plain answer **and** draws a chart
   or map. It is *forbidden* from inventing numbers — every figure comes from the data.
   *(This is **grounding**.)*

---

## 4. The architecture

```
        ┌─────────────────────────────────────────────────────┐
        │                    YOUR BROWSER                       │
        │   Chat box  +  Charts (Recharts)  +  Map (MapLibre)   │
        └───────────────────────────┬─────────────────────────┘
                                     │  your question
                                     ▼
        ┌─────────────────────────────────────────────────────┐
        │              THE APP (Next.js server)                 │
        │                                                       │
        │  1. Turn the question into an "embedding" (numbers)   │
        │       → Google Gemini embeddings                      │
        │  2. Find the best-matching dataset                    │
        │       → Qdrant (vector database)                      │
        │  3. Run the AI agent with ONLY that dataset's tool    │
        │       → Groq (Llama model) via the AI SDK             │
        │  4. The tool fetches real data                        │
        │       → Toronto CKAN API  (cached in PostgreSQL)      │
        │  5. Stream back: answer + chart data + map data       │
        └───────┬───────────────┬───────────────┬─────────────┘
                │               │               │
                ▼               ▼               ▼
        ┌────────────┐   ┌────────────┐  ┌──────────────────┐
        │  Qdrant    │   │ PostgreSQL │  │ Toronto Open Data │
        │ (matching) │   │  (cache +  │  │   (CKAN API)      │
        │            │   │  history)  │  │                   │
        └────────────┘   └────────────┘  └──────────────────┘
```

**Read it as a sentence:** *The browser sends a question to the Next.js app. The app
converts it to numbers (an embedding), uses Qdrant to find the right dataset, runs a
Groq AI model that's given only that dataset's tool, the tool pulls live data from
Toronto's CKAN API (cached in PostgreSQL), and the answer streams back with a chart
or map.*

---

## 5. Every technology explained

For each item: **what it is** (plain) and **why we use it**.

### The foundation
| Tech | What it is (plain English) | Why we use it |
|---|---|---|
| **Node.js** | A way to run JavaScript code on a server (not just in a browser) | It's the standard runtime for modern web apps; lets one language (JS/TS) run front *and* back |
| **TypeScript** | JavaScript with a spell-checker for data types | Catches bugs *before* the app runs; "strict mode" means fewer surprises |
| **Next.js** | A framework that builds the website *and* the backend together | One project for both the page you see and the server logic behind it |
| **React** | The library that draws the interactive page | Industry standard for building UI out of reusable "components" |
| **Tailwind CSS** | A styling shortcut — you add class names like `text-blue-700` | Fast, consistent styling without writing separate CSS files |

### The AI layer
| Tech | What it is | Why we use it |
|---|---|---|
| **LLM** (Large Language Model) | The AI "brain" that understands and writes language | It reads the question and writes the human-friendly answer |
| **Google Gemini** | Google's family of AI models | Used here for **embeddings** (turning text into numbers); generous free tier |
| **Groq** | A service that runs open models (Llama) *very fast* | Used for the **chat/agent**; its free tier allows far more requests/day than Gemini |
| **Vercel AI SDK** (`ai`) | A toolkit that makes talking to any AI model consistent | Lets us swap Gemini ↔ Groq with a one-line change; handles "tool calling" & streaming |
| **Embeddings** | Turning text into a list of numbers that captures *meaning* | So the computer can measure how "similar" your question is to each dataset |

### The data layer
| Tech | What it is | Why we use it |
|---|---|---|
| **Qdrant** | A **vector database** — a search engine for *meaning*, not keywords | Stores the "number-fingerprints" of each dataset and finds the closest match to your question |
| **PostgreSQL** | A traditional database that stores data in tables | Stores the **cache** (recent API results), **query history**, and **eval results** |
| **`pg`** | The code library that lets our app talk to PostgreSQL | Simple, direct SQL — no heavy "ORM" layer in the way |
| **CKAN API** | Toronto's official open-data service (a web address you can fetch data from) | This is the **real source of truth** — all answers come from here |

### The presentation layer
| Tech | What it is | Why we use it |
|---|---|---|
| **Recharts** | A charting library for React | Draws the bar charts (e.g. crime by neighbourhood) |
| **MapLibre GL** | An interactive map library | Draws maps with points (restaurants) and shaded areas (crime) |
| **OpenStreetMap** | Free map imagery (like Google Maps, but open) | Map background tiles — **no API key or payment needed** |
| **Zod** | A library that checks data has the right shape | Validates every tool's inputs and outputs so the AI can't pass garbage |

---

## 6. Why Docker?

**The problem Docker solves:** Software needs specific things installed to run — a
database, the right version, the right settings. Setting all that up by hand on each
computer is slow and error-prone ("it works on my machine!").

**What Docker is (analogy):** Docker packages a piece of software into a **shipping
container** — a sealed box with everything it needs inside. You can run that exact box
on any computer and it behaves identically.

**How we use it:** Our app needs two supporting services — **PostgreSQL** (the database)
and **Qdrant** (the vector search). Instead of installing them manually, we describe them
in one file, `docker-compose.yml`, and start both with a single command:

```bash
docker compose up -d
```

- `docker compose` = run multiple containers together from the recipe file.
- `up` = start them. `-d` = "detached" (run in the background).

**Why it matters for an interview:** *"Docker means anyone can run my whole project with
one command, with zero manual setup — the database and vector store start in seconds,
identically every time."*

> Note: The **app itself** (Next.js) runs directly with `npm run dev`; only the two
> supporting services run in Docker. That's a deliberate choice — fast code reloading
> for development, reproducible infrastructure for the databases.

---

## 7. Core AI concepts

These five concepts are the intellectual core of the project. Learn these and you can
explain the whole thing.

### RAG (Retrieval-Augmented Generation)
**Plain English:** Instead of trusting the AI's memory, you first *look up* the relevant
information, then let the AI answer *using* it.
**Why:** AI models can confidently make things up. RAG keeps answers tied to real data.
**Here:** We "retrieve" the right dataset before the AI ever writes an answer.

### Embeddings & vector search
**Plain English:** An **embedding** turns text into a list of numbers that represents its
*meaning*. Two sentences with similar meaning get similar numbers. A **vector database**
(Qdrant) stores these and finds the closest match — like a search engine for meaning.
**Why:** It lets "Where can I cool off in summer?" correctly match the *pools/parks*
dataset even though it shares no exact words with it.

### Tool calling (a.k.a. function calling)
**Plain English:** Modern AI models can decide to *run a piece of code* (a "tool") to
fetch real data, instead of guessing.
**Why:** The AI doesn't *know* today's crime numbers — but it can *call a tool* that
fetches them. This is how we connect the AI to live government data.

### Grounding
**Plain English:** Forcing the AI to base its answer only on the data the tool returned.
**Why:** This is the anti-hallucination rule. If the tool returns no data, the app says
so rather than inventing an answer.

### Hallucination
**Plain English:** When an AI confidently states something false.
**Why it matters here:** An app that invents a crime statistic is dangerous. Everything
in this project is designed to *prevent* this — that's the whole point.

---

## 8. The router pattern

This is the single most important design decision — emphasize it in interviews.

**The naive approach:** Give the AI all 6 tools and hope it picks the right one. This
often goes wrong — the AI gets confused, picks the wrong tool, or mixes them up.

**Our approach (the router pattern):**
1. First, **RAG** figures out which *one* dataset the question is about.
2. Then we build the AI agent with **only that one tool**.
3. The AI now has a single, focused job — it can't pick wrong.

**Analogy:** Instead of handing someone the keys to the entire building and saying "find
the right room," you walk them to the one door they need.

> **Interview soundbite:** *"I used a router pattern — retrieval selects the dataset
> first, then the agent gets only that dataset's tool. It keeps the AI focused and
> dramatically improves accuracy over dumping all tools on the model."*

---

## 9. The 6 datasets

Each dataset has a matching **tool** — a small piece of code that knows how to fetch and
shape that data.

| Topic | Tool | Example question | Shows |
|---|---|---|---|
| Neighbourhood crime | `getCrimeData` | "Most break-ins in 2024?" | Bar chart + city map |
| TTC subway delays | `getTtcDelays` | "Delays on the Yonge line?" | Summary + table |
| Parks, pools & splash pads | `getSplashPads` | "Find a pool near me" | Map of locations |
| Building permits | `getBuildingPermits` | "Recent demolition permits?" | Table |
| Bike lanes / cycling | `getCyclingNetwork` | "Bike lanes on Bloor?" | Map of routes |
| Restaurant inspections | `getDinesafe` | "Which restaurants were closed?" | Map of restaurants |

**Every tool returns the same shape:** `{ rows, metadata }` (plus map shapes `geoJson`
for the geographic ones). Consistency makes the UI simple and predictable.

---

## 10. The trust features

These three features prove the app is honest — they're inspired by a city hackathon and
are great to demo:

1. **Confidence badge** — shows which dataset the AI chose and how sure it was, e.g.
   *"Matched: Neighbourhood Crime Rates · 0.67"*. You see its reasoning.
2. **Source-attribution chips** — under each answer: which official dataset, how many
   records, whether the data was **live or cached**, the timestamp, and the official
   record ID. Total transparency — you can verify it yourself.
3. **Crime choropleth map** — *choropleth* = a map shaded by value (darker = more). It
   colours neighbourhoods by crime count so you see hotspots at a glance.

Plus a **clear error message**: if the free AI tier hits its daily limit, the app *tells*
you instead of failing silently.

> **Interview soundbite:** *"Trust was the hardest part. So every number is traceable to
> a named government source shown right in the interface, and failures are explained, not
> hidden."*

---

## 11. The model journey

This story shows real engineering judgment — interviewers love it.

1. **Started with Ollama (local AI).** The plan was to run an open model (`qwen3`) on the
   local machine. **Problem:** it needed a multi-gigabyte download and a strong GPU; on a
   normal laptop it was slow and unreliable.
2. **Switched to Google Gemini (cloud).** Free, no GPU, no big download. **Problem
   discovered:** the free tier only allows **~20 chat requests per day** for this model —
   fine for a quick test, too little for real use or a demo.
3. **Switched chat to Groq (cloud).** Groq runs the Llama model with a much larger free
   allowance (thousands/day). **Kept Gemini for embeddings** (Groq doesn't offer them).

**The key lesson:** the project was *designed* so the AI provider is a single swappable
layer (`lib/llm.ts`). Changing providers was a one-line change — that's good architecture.

> **Interview soundbite:** *"I isolated the model provider behind one module, so when the
> free-tier limits forced a switch, I changed one line — embeddings on Gemini, chat on
> Groq — with no impact on the rest of the system."*

---

## 12. The GPU restriction

**Context:** This project was inspired by the **Toronto Spark Hackathon**, where teams
used **NVIDIA DGX Spark** machines — powerful computers with big GPUs. They ran huge AI
models *locally* (e.g. Nemotron 70B–120B), GPU-accelerated data crunching (RAPIDS), route
optimizers (cuOpt), 3D city models, computer vision, and voice — all on-device.

**Our constraint:** We have **no GPU and no expensive hardware.** So we made the opposite
(and arguably smarter for accessibility) choice: a **cloud-first, runs-anywhere** design.

### What we *couldn't* do because of no GPU, and what we did instead

| Hackathon feature (needs GPU) | Why it needs a GPU | Our cloud alternative |
|---|---|---|
| Local 70B–120B AI models (Nemotron) | Huge models need lots of GPU memory | Cloud APIs (Gemini, Groq) — no local hardware |
| RAPIDS / cuDF (fast data crunching) | GPU-parallel number crunching | We process modest data in plain TypeScript; CKAN + caching keeps it fast |
| cuOpt (route/schedule optimization) | GPU-based math solver | Out of scope — we answer/visualize, we don't optimize routes |
| cuGraph (city-scale graph analysis) | GPU graph processing | Out of scope |
| 3D digital twins (Three.js + GPU) | Real-time 3D rendering | We use 2D maps (MapLibre) — lighter, runs in any browser |
| Computer vision (crack/photo detection) | GPU image models | Out of scope (no image input) |
| On-device voice (Whisper/Parakeet) | GPU speech models | Could add the browser's built-in voice later (no GPU needed) |

**The honest framing for an interview:** *"The hackathon projects were impressive but
hardware-locked — they only run on a $30k+ NVIDIA box. I deliberately built a cloud-first
version that runs on any laptop for free. Different trade-off: I gave up local 'big model'
power and GPU number-crunching, but gained portability, zero cost, and zero setup."*

---

## 13. Future additions

Things that fit the architecture and could be added next:

**Easy / no GPU needed**
- **Voice input** — use the browser's built-in speech recognition (a microphone button).
- **Conversation memory** — let follow-up questions ("what about 2023?") use earlier context.
- **More datasets** — any Toronto dataset that's queryable via the API (e.g. RentSafeTO
  apartment-building evaluations, short-term-rental registrations).
- **A query-history panel** — we already log every question; surface it in the UI.
- **Pre-filled 311 complaint generator** — draft a ready-to-file complaint from an answer.

**Medium effort**
- **Trend lines & simple forecasts** — e.g. "break-ins up ~12% over 3 years" (crime data
  spans 2014–2025). Simple math, clearly labelled — no heavy ML.
- **Multi-dataset questions** — "compare crime and bike lanes" — would extend the router.
- **Better evals** — finish the automated accuracy scoring (the harness exists).

**If a GPU/budget became available**
- **Local private model** — for privacy-sensitive use (data never leaves the building).
- **Larger document RAG** — ingest the full Toronto Municipal Code for bylaw-cited answers.
- **Optimization features** — routing/scheduling like the hackathon's cuOpt projects.
- **Image input** — "here's a photo of a pothole" → auto-fill a 311 report.

**Why we couldn't add a 311 dataset (a real finding):** Toronto's 311 service-request data
is published only as **downloadable ZIP files**, not a queryable API — so it can't be used
with our live-fetch approach without building a separate import pipeline.

---

## 14. How to run and test

### One-time setup
1. Install **Docker Desktop** and **Node.js**.
2. Create a file called `.env.local` with your keys:
   ```
   GOOGLE_GENERATIVE_AI_API_KEY=...   (for embeddings — from aistudio.google.com)
   GROQ_API_KEY=...                   (for chat — from console.groq.com)
   QDRANT_URL=http://localhost:6333
   DATABASE_URL=postgresql://toronto:toronto@localhost:5432/torontoai
   ```

### Start it
```bash
docker compose up -d                 # start the database + vector store
npm install                          # install code dependencies (first time)
npx tsx scripts/ingest_catalog.ts    # load the 6 datasets into Qdrant (first time)
npm run dev                          # start the app → http://localhost:3000
```

### Demo script (ask these in order)
1. *"Which neighbourhood had the most break-ins in 2024?"* → bar chart + map + source chips.
2. *"Which restaurants were closed by inspections?"* → switches topic automatically; map.
3. *"How bad are TTC subway delays?"* → a totally different dataset.

**While demoing, point at:** the **confidence badge** (it's choosing the dataset), the
**source chips** (proof of where the data came from), and ask the *same* question twice to
show the **"cached"** chip (instant the second time).

---

## 15. Glossary

| Term | Plain meaning |
|---|---|
| **API** | A web address an app can fetch data from (Toronto's CKAN is one) |
| **Agent** | An AI that can take actions (call tools), not just chat |
| **Cache / caching** | Saving a recent result so you don't re-fetch it (faster, kinder to servers) |
| **CKAN** | The software behind Toronto's open-data portal; our data source |
| **Choropleth** | A map shaded by value (darker = more) |
| **Container (Docker)** | A sealed box with software + everything it needs to run |
| **Embedding** | Text converted to numbers that capture meaning |
| **Endpoint** | A specific API web address you call |
| **Environment variable** | A secret/setting (like an API key) kept outside the code, in `.env.local` |
| **Free tier** | The no-cost usage allowance of a paid service |
| **Grounding** | Forcing answers to be based only on fetched data |
| **Hallucination** | When an AI confidently makes something up |
| **LLM** | Large Language Model — the AI that understands/writes language |
| **ORM** | A layer that hides SQL; we deliberately *don't* use one (plain SQL instead) |
| **Rate limit** | A cap on how many requests you can make (per minute or per day) |
| **RAG** | Retrieval-Augmented Generation — look up facts first, then let the AI answer |
| **Router pattern** | Pick the one right tool first, then give the AI only that tool |
| **Schema** | A definition of what shape data must have (we use Zod for this) |
| **SQL** | The language for talking to a traditional database (PostgreSQL) |
| **Streaming** | Sending the answer word-by-word as it's generated (feels responsive) |
| **Token** | A chunk of text (~¾ of a word) the AI counts; limits are measured in tokens |
| **Tool / function calling** | The AI running code to fetch real data |
| **TTL (time-to-live)** | How long a cached item stays fresh before refetching |
| **Vector database** | A search engine for meaning (Qdrant) |

---

## 16. Interview Q&A

**Q: What does your project do?**
*"It lets anyone ask questions about Toronto in plain English and get answers grounded in
real city open data, with charts and maps. It turns hard-to-use public data into simple
answers."*

**Q: How does it work technically?**
*"A Next.js app takes the question, converts it to an embedding, uses the Qdrant vector
database to pick the right dataset, then runs an AI agent (Groq's Llama model via the
Vercel AI SDK) that's given only that dataset's tool. The tool fetches live data from
Toronto's CKAN API, cached in PostgreSQL, and the answer streams back with a visual."*

**Q: What's the hardest/most interesting part?**
*"Making it trustworthy. AI can hallucinate, which is dangerous for civic data. So I used
a router pattern to keep the agent focused, grounded every answer in real fetched data,
and showed the source of every number in the UI."*

**Q: Why did you switch AI providers?**
*"I isolated the model behind one module. When Gemini's free tier (20 requests/day) proved
too small, I switched the chat model to Groq in one line, keeping Gemini for embeddings."*

**Q: Why Docker?**
*"So the database and vector store start with one command, identically on any machine —
zero manual setup."*

**Q: What would you add next?**
*"Voice input, conversation memory, simple trend/forecast charts, and more datasets. With
a GPU/budget I'd add a local private model and full bylaw-document RAG."*

**Q: What's a limitation?**
*"Free-tier rate limits. I mitigated this by caching, trimming how much data the AI
processes, and showing a clear message when a limit is hit."*

---

## 17. Limitations

Honest trade-offs (good to acknowledge in interviews):

- **Free-tier limits.** Cloud AI free tiers cap requests. We cache aggressively and keep
  the data sent to the AI small, but heavy use needs a paid tier.
- **One dataset per question.** The router picks a single dataset; true cross-dataset
  questions ("compare crime and cycling") aren't supported yet.
- **Toronto's API quirks.** Some datasets (like 311) are download-only and can't be
  queried live; the SQL query endpoint is disabled, so we filter in code instead.
- **Map detail vs. AI limits.** Map shapes (geometry) are large; we simplify and limit
  them so they fit the AI's token budget — a deliberate trade-off of detail for reliability.
- **No GPU features.** No local big-model inference, 3D twins, or heavy optimization —
  conscious choices to stay free and portable.

---

*This guide describes the project as built: a cloud-first, grounded, transparent natural-
language interface to Toronto's open data — designed to run anywhere, for free, and to be
fully explainable.*
