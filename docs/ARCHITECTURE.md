# Architecture

> These diagrams render automatically on GitHub (Mermaid). They describe how a
> question flows through Ask Toronto from the browser to real Toronto open data
> and back.

## System overview

```mermaid
flowchart TD
    User([User types a question]) --> UI

    subgraph Browser["🖥️ Browser (Next.js + React)"]
        UI[Chat box]
        Chart[Recharts charts]
        Map[MapLibre map]
    end

    UI -->|POST /api/chat| Route

    subgraph Server["⚙️ Next.js Server — /api/chat"]
        Route[Route handler]
        Embed[1 - Embed question]
        RAG[2 - Match dataset]
        Agent[3 - Router agent<br/>only ONE tool]
        Tool[4 - Dataset tool]
    end

    Route --> Embed
    Embed -->|gemini-embedding-001| Gemini[(Google Gemini<br/>embeddings)]
    Embed --> RAG
    RAG -->|nearest vector| Qdrant[(Qdrant<br/>vector DB)]
    RAG --> Agent
    Agent -->|llama-3.3-70b| Groq[(Groq<br/>chat model)]
    Agent --> Tool
    Tool -->|live fetch| CKAN[(Toronto CKAN<br/>Open Data API)]
    Tool -->|cache check/store| PG[(PostgreSQL<br/>cache + history)]

    Tool -->|"{ answer, rows, geoJson }"| Route
    Route -->|streamed| UI
    Route --> Chart
    Route --> Map

    classDef ext fill:#eef,stroke:#557;
    class Gemini,Groq,Qdrant,PG,CKAN ext;
```

## The router pattern (why answers stay accurate)

```mermaid
flowchart LR
    Q([Question]) --> R{RAG retrieval<br/>picks 1 dataset}
    R -->|crime| T1[getCrimeData ONLY]
    R -->|transit| T2[getTtcDelays ONLY]
    R -->|restaurants| T3[getDinesafe ONLY]
    R -.->|the other 5 tools<br/>are NOT given<br/>to the agent| X[(withheld)]
    T1 --> A[Agent answers<br/>grounded in tool data]
    T2 --> A
    T3 --> A
```

**Key idea:** retrieval selects the dataset *first*, then the agent is built with only
that dataset's tool — so it can't pick the wrong one. This is far more reliable than
handing the model all six tools at once.

## Request lifecycle (step by step)

```mermaid
sequenceDiagram
    participant U as User
    participant A as App (/api/chat)
    participant G as Gemini (embed)
    participant Q as Qdrant
    participant L as Groq (LLM)
    participant C as CKAN + Postgres

    U->>A: "Most break-ins in 2024?"
    A->>G: embed question
    G-->>A: vector (768 numbers)
    A->>Q: nearest dataset?
    Q-->>A: "neighbourhood-crime-rates" (score 0.67)
    A->>L: answer using getCrimeData tool only
    L->>A: call getCrimeData(offence, year)
    A->>C: cached? else fetch live
    C-->>A: rows + geometry
    A->>L: here is the data
    L-->>A: grounded answer text
    A-->>U: stream answer + chart + map + source chips
```

## Infrastructure (what Docker runs)

```mermaid
flowchart TB
    subgraph Local["Your machine"]
        App[Next.js app<br/>npm run dev]
        subgraph Docker["docker compose up -d"]
            PG[(PostgreSQL 16<br/>:5432)]
            QD[(Qdrant<br/>:6333)]
        end
    end
    App --> PG
    App --> QD
    App -->|internet| Cloud[(Gemini · Groq · CKAN)]
```
