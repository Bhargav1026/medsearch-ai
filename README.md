# MedSearch AI

> **Stance-aware medical literature search powered by Hybrid BM25 + Semantic Retrieval, Medical NLI Classification, and Evidence-Grounded RAG Chat.**

Instead of a flat ranked list, MedSearch AI tells you *which* studies **support**, **oppose**, or stay **neutral** toward your query — then lets you ask follow-up questions grounded exclusively in the retrieved abstracts.

---

## Table of Contents

1. [What We Built](#1-what-we-built)
2. [Tech Stack](#2-tech-stack)
3. [Project Architecture](#3-project-architecture)
4. [Full Pipeline Flow](#4-full-pipeline-flow)
   - [Step 1 — Query Processing](#step-1--query-processing)
   - [Step 2 — PubMed Retrieval](#step-2--pubmed-retrieval)
   - [Step 3 — BM25 Re-ranking](#step-3--bm25-re-ranking)
   - [Step 4 — Semantic Re-ranking](#step-4--semantic-re-ranking)
   - [Step 5 — RRF Fusion](#step-5--rrf-fusion)
   - [Step 6 — Stance Classification (NLI)](#step-6--stance-classification-nli)
   - [Step 7 — Results UI](#step-7--results-ui)
   - [Step 8 — RAG Chat](#step-8--rag-chat)
5. [Flowchart](#5-flowchart)
6. [API Reference](#6-api-reference)
7. [Environment Variables](#7-environment-variables)
8. [Fallback Chains](#8-fallback-chains)
9. [Key Design Decisions](#9-key-design-decisions)
10. [File Structure](#10-file-structure)
11. [Running Locally](#11-running-locally)
12. [What We Achieved](#12-what-we-achieved)

---

## 1. What We Built

MedSearch AI is a full-stack medical literature intelligence platform with three core capabilities:

| Capability | What it does |
|---|---|
| **Hybrid Search** | Fetches PubMed abstracts, re-ranks with BM25 + sentence-transformer embeddings, fuses with RRF |
| **Stance Classification** | Uses Medical NLI to label each abstract as *Supporting*, *Opposing*, or *Neutral* relative to your query |
| **Evidence-Grounded Chat** | RAG-style Q&A where every answer cites a real PMID from the retrieved abstracts |

**The problem it solves:** Standard PubMed search returns a flat list sorted by relevance. You still have to read every paper to know if it supports or contradicts your hypothesis. MedSearch AI does that work automatically and surfaces the disagreement in the literature.

---

## 2. Tech Stack

### Frontend
| Tool | Version | Purpose |
|---|---|---|
| Next.js (App Router) | 16.2.2 | Full-stack React framework, API routes |
| React | 19.2.4 | UI rendering |
| TypeScript | ^5 | Type safety across frontend + backend |
| Tailwind CSS | ^4 | Styling and dark theme |
| Lucide React | ^1.8.0 | Icons |

### Backend / APIs
| Service | Model / Endpoint | Purpose |
|---|---|---|
| **NCBI E-utilities** | esearch + efetch | Fetch PubMed abstracts |
| **HuggingFace Inference** | `sentence-transformers/all-MiniLM-L6-v2` | Semantic embeddings for retrieval |
| **HuggingFace Inference** | `facebook/bart-large-mnli` | Zero-shot NLI stance classification |
| **Google Gemini** | `gemini-2.0-flash` | Primary classifier + primary chat model |
| **OpenAI** | `gpt-4.1-mini` | Fallback classifier + fallback chat model |
| **HuggingFace Inference** | `mistralai/Mistral-7B-Instruct-v0.3` | Tertiary chat fallback |

### Algorithms (implemented from scratch)
| Algorithm | Details |
|---|---|
| **Okapi BM25** | k₁=1.5, b=0.75, title 2× boost, pure TypeScript implementation |
| **Reciprocal Rank Fusion (RRF)** | k=60, fuses BM25 + semantic ranked lists |
| **Cosine Similarity** | Via HuggingFace feature-extraction API |
| **Local Keyword NLI** | Heuristic fallback when all APIs fail |

---

## 3. Project Architecture

```
medsearch-ai/
├── app/
│   ├── page.tsx                        # Landing page (hero, search bar, features)
│   ├── layout.tsx                      # Root layout, fonts, metadata
│   ├── globals.css                     # Theme tokens, animations, skeleton
│   │
│   ├── _components/
│   │   └── IntroSplash.tsx             # One-time animated intro (sessionStorage)
│   │
│   ├── api/
│   │   ├── search/route.ts             # POST /api/search — full retrieval + NLI pipeline
│   │   └── chat/route.ts               # POST /api/chat — RAG chat with fallback chain
│   │
│   ├── search/
│   │   ├── page.tsx                    # Search results page (server component)
│   │   └── _components/
│   │       ├── ResultsClient.tsx       # Client component — search bar, 3-column results
│   │       ├── AbstractCard.tsx        # Individual abstract card with expand/collapse
│   │       └── ChatDrawer.tsx          # Slide-in chat panel with citation highlighting
│   │
│   └── workflow/
│       └── page.tsx                    # Live pipeline visualization / flowchart page
│
├── .env.local                          # API keys (not committed)
├── package.json
└── README.md
```

---

## 4. Full Pipeline Flow

### Step 1 — Query Processing

**File:** `app/api/search/route.ts` → `buildPubMedQuery()`

When a user types a query like *"statins and cognitive decline"*, the backend:

1. **Tokenizes** the query into individual words
2. **Removes stop words** — common English words (the, and, is, with, etc.) that add no retrieval signal
3. **Builds a PubMed Boolean query** — each meaningful term is wrapped with `[Title/Abstract]` field qualifier
4. **Joins with AND** — produces `statins[Title/Abstract] AND cognitive[Title/Abstract] AND decline[Title/Abstract]`

This structured query dramatically improves PubMed's retrieval precision over free-text search.

---

### Step 2 — PubMed Retrieval

**File:** `app/api/search/route.ts` → `fetchFromPubMed()`

Uses NCBI's E-utilities API in two sequential calls:

**Call 1 — esearch** (find matching PMIDs):
```
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
  ?db=pubmed
  &term={boolean_query}
  &retmax=20
  &retmode=json
  &sort=relevance
  &api_key={NCBI_API_KEY}
```
Returns up to **20 PMIDs** sorted by relevance.

**Call 2 — efetch** (download full abstracts):
```
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
  ?db=pubmed
  &id={comma_separated_pmids}
  &rettype=abstract
  &retmode=xml
```
Returns XML with full metadata: title, authors, journal, year, abstract text, MeSH terms.

**Parsing:** `parseArticles()` extracts fields from the PubMed XML using regex-based tag matching. Each article becomes an `Article` object:
```typescript
interface Article {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  meshTerms: string[];
}
```

---

### Step 3 — BM25 Re-ranking

**File:** `app/api/search/route.ts` → `bm25Score()`

A full **Okapi BM25** implementation in plain TypeScript — no external library.

**Parameters:**
- `k₁ = 1.5` — controls term frequency saturation (how quickly extra occurrences of a term stop adding value)
- `b = 0.75` — controls document length normalization (penalizes very long documents)

**Title Boost:**
Before scoring, each article's text is constructed as:
```
`${article.title} ${article.title} ${article.abstract}`
```
The title appears **twice** so title matches are weighted 2× over abstract matches.

**IDF Formula:**
```
IDF(t) = log((N - n_t + 0.5) / (n_t + 0.5) + 1)
```
Where N = total documents, n_t = documents containing term t.

**BM25 Score per document:**
```
Score(d, q) = Σ IDF(t) × [ tf(t,d) × (k₁ + 1) ] / [ tf(t,d) + k₁ × (1 - b + b × |d|/avgdl) ]
```

All 20 retrieved articles are scored and sorted descending. The top-ranked list feeds into RRF fusion.

---

### Step 4 — Semantic Re-ranking

**File:** `app/api/search/route.ts` → `semanticRank()`

Uses the **HuggingFace Inference API** with `sentence-transformers/all-MiniLM-L6-v2`:

```
POST https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2
{
  "inputs": {
    "source_sentence": "{user query}",
    "sentences": ["{abstract_1}", "{abstract_2}", ...]
  }
}
```

Returns an array of **cosine similarity scores** (float 0–1) — one per abstract. These represent how semantically similar each abstract is to the query in a shared 384-dimensional embedding space.

All articles are sorted descending by semantic similarity score to produce the semantic ranked list.

**Timeout:** 15,000ms. If the HuggingFace API is unavailable (cold start, 503), semantic ranking is skipped gracefully and BM25-only is used.

---

### Step 5 — RRF Fusion

**File:** `app/api/search/route.ts` → `rerankWithRRF()`

**Reciprocal Rank Fusion** merges the BM25 ranked list and the semantic ranked list into a single unified ranking without needing to normalize scores across different scales.

**Formula (Robertson 2009):**
```
RRF_score(d) = Σ_r  1 / (k + rank_r(d))
```
Where `k = 60` and `rank_r(d)` is the position of document `d` in ranker `r`.

**Implementation:**
```typescript
const k = 60;
// BM25 contribution
bm25Ranked.forEach(({ article }, i) => {
  rrfScoreMap.set(article.pmid, (rrfScoreMap.get(article.pmid) || 0) + 1 / (k + i + 1));
});
// Semantic contribution
semanticRanked.forEach(({ article }, i) => {
  rrfScoreMap.set(article.pmid, (rrfScoreMap.get(article.pmid) || 0) + 1 / (k + i + 1));
});
```

The merged list is sorted by RRF score descending. The **top 8 articles** are selected for classification. Scores are normalized to [0, 1] for display.

---

### Step 6 — Stance Classification (NLI)

**File:** `app/api/search/route.ts` → `classifyAbstracts()`

Each of the 8 selected abstracts is classified as **support**, **oppose**, or **neutral** relative to the user's query. This uses a 4-tier fallback chain (see [Fallback Chains](#8-fallback-chains) for full details).

**Primary: Gemini 2.0 Flash**

Sends all 8 abstracts in a single batch request. The system prompt instructs it to act as a medical NLI classifier and return structured JSON:
```json
[
  { "pmid": "12345678", "stance": "support", "confidence": 0.92 },
  { "pmid": "87654321", "stance": "oppose",  "confidence": 0.78 }
]
```

**Confidence thresholds (for BART-MNLI fallback):**
- `supports` score ≥ 0.60 → classified as `support`
- `contradicts` score ≥ 0.55 → classified as `oppose`
- Otherwise → `neutral`

**Rate limit caching:**
- Gemini 429 failures are cached for **60 minutes** — skips dead API for an hour
- OpenAI 429 failures are cached for **5 minutes**

---

### Step 7 — Results UI

**File:** `app/search/_components/ResultsClient.tsx`, `AbstractCard.tsx`

The classified abstracts are displayed in a **3-column stance-aware grid**:

| Column | Color | Criteria |
|---|---|---|
| Supporting | Green | stance = "support" |
| Opposing | Red | stance = "oppose" |
| Neutral / Mechanistic | Purple | stance = "neutral" |

Within each column, abstracts are sorted by **confidence descending** (most certain classifications first).

**Each AbstractCard shows:**
- Stance badge + confidence percentage
- Title (clickable — opens PubMed in new tab)
- Authors (first author + "et al." if >2 authors)
- Journal + year
- Abstract excerpt (expandable with "Show more")
- MeSH terms (up to 6)
- Normalized relevance score badge

**Stats bar** at the top shows:
- Total abstracts retrieved
- Count per stance (green/red/purple dots)
- Retrieval method badge: `⚡ BM25 + Semantic (RRF)` or `BM25` fallback
- Retrieval latency in ms
- Classification latency in ms

---

### Step 8 — RAG Chat

**File:** `app/api/chat/route.ts`, `app/search/_components/ChatDrawer.tsx`

After results load, users can open the **Ask AI** panel to ask follow-up questions grounded in the retrieved abstracts.

**Context building:**
All 8 classified abstracts are formatted into a structured evidence context:
```
RESEARCH TOPIC: "statins and cognitive decline"
TOTAL PAPERS: 8 (3 supporting, 2 opposing, 3 neutral)

=== SUPPORTING EVIDENCE (3 papers) ===
[1] PMID:12345678 | Stance: SUPPORT | Confidence: 92%
    Title: "Statin use and risk of dementia..."
    Authors: Smith et al.
    Journal: NEJM (2023)
    Abstract: ...
```

**System persona — "Dr. Evidence":**
The LLM is instructed to behave as a senior medical research analyst:
- Answer the exact question asked (no padding)
- Always cite PMIDs as `[PMID:XXXXXX]` inline
- Quote concrete numbers: HR, OR, RR, p-values, sample sizes
- Be honest about conflicting evidence
- Never hallucinate beyond the provided abstracts

**Multi-turn conversation:**
- Last 10 turns are sent with each request
- Gemini uses `user`/`model` role alternation
- OpenAI fallback uses `system`/`user`/`assistant` roles

**Citation extraction + highlighting:**
The response text is scanned with regex `PMID:(\d+)`. Matching AbstractCards are **highlighted in real-time** in the evidence sidebar of the chat panel.

---

## 5. Flowchart

```
User Query
     │
     ▼
┌─────────────────────────────┐
│   Query Processing           │
│   • Stop-word removal        │
│   • Boolean PubMed syntax    │
│   • [Title/Abstract] fields  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   PubMed / NCBI Fetch        │
│   • esearch → 20 PMIDs       │
│   • efetch  → XML abstracts  │
│   • Parse: title, authors,   │
│     journal, year, MeSH      │
└──────────────┬──────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌────────────┐   ┌──────────────────┐
│  BM25      │   │  Semantic Embed  │
│  Re-rank   │   │  all-MiniLM-L6   │
│  k₁=1.5   │   │  via HuggingFace │
│  b=0.75    │   │  cosine sim      │
│  title 2×  │   │  (15s timeout)   │
└─────┬──────┘   └───────┬──────────┘
      │                  │
      └────────┬─────────┘
               │
               ▼
┌─────────────────────────────┐
│   RRF Fusion                 │
│   score = 1/(60 + rank)      │
│   BM25 + Semantic → merge    │
│   → Top 8 articles           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Stance Classification (NLI)            │
│                                          │
│   Try in order until one succeeds:       │
│   1. Gemini 2.0 Flash      (batch JSON) │
│   2. GPT-4.1 Mini          (batch JSON) │
│   3. BART-large-MNLI       (HF API)     │
│   4. Local Keyword Heuristic            │
│                                          │
│   Output: support / oppose / neutral     │
│           + confidence score             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│   3-Column Results UI        │
│                              │
│  ┌─────────┬────────┬──────┐│
│  │Support  │Oppose  │Neut  ││
│  │ (green) │  (red) │(purp)││
│  └─────────┴────────┴──────┘│
│                              │
│  Sorted by confidence ↓      │
│  Clickable PMID → PubMed     │
│  Expandable abstracts        │
│  MeSH terms + score badge    │
└──────────────┬──────────────┘
               │
               ▼ (user clicks "Ask AI")
┌─────────────────────────────────────────┐
│   RAG Chat — "Dr. Evidence"              │
│                                          │
│   Evidence context: all 8 abstracts      │
│   formatted with stance + confidence     │
│                                          │
│   Try in order until one succeeds:       │
│   1. Gemini 2.0 Flash   (multi-turn)    │
│   2. GPT-4.1 Mini       (6k ctx limit) │
│   3. Mistral-7B-Instruct (HF API)       │
│   4. Local Evidence Summary             │
│                                          │
│   PMID citations extracted from reply   │
│   → AbstractCards highlighted live      │
└─────────────────────────────────────────┘
```

---

## 6. API Reference

### `POST /api/search`

Runs the full retrieval + classification pipeline.

**Request:**
```json
{
  "query": "statins and cognitive decline"
}
```

**Response:**
```json
{
  "query": "statins and cognitive decline",
  "totalFound": 8,
  "retrievalMs": 1240,
  "classificationMs": 3200,
  "retrievalMethod": "hybrid",
  "results": {
    "support": [
      {
        "pmid": "12345678",
        "title": "Statins and cognitive decline...",
        "authors": ["Smith J", "Doe A"],
        "journal": "NEJM",
        "year": 2023,
        "excerpt": "Abstract text...",
        "meshTerms": ["Statins", "Cognitive Decline"],
        "score": 0.94,
        "stance": "support",
        "confidence": 0.91
      }
    ],
    "oppose": [...],
    "neutral": [...]
  }
}
```

**`retrievalMethod`** values:
| Value | Meaning |
|---|---|
| `"hybrid"` | BM25 + semantic + RRF fusion succeeded |
| `"bm25"` | Semantic embeddings unavailable, BM25-only used |
| `"ncbi"` | All ranking failed, raw NCBI order returned |

---

### `POST /api/chat`

Answers a question grounded in previously retrieved abstracts.

**Request:**
```json
{
  "query": "statins and cognitive decline",
  "message": "Which paper had the largest sample size?",
  "history": [
    { "role": "user", "content": "What does the supporting evidence say?" },
    { "role": "assistant", "content": "The study by Smith et al. [PMID:12345678]..." }
  ],
  "abstracts": [/* full abstract objects from /api/search response */]
}
```

**Response:**
```json
{
  "response": "The largest study was **Johnson et al.** [PMID:87654321] with n=42,000 patients...",
  "citedPmids": ["87654321"]
}
```

---

## 7. Environment Variables

Create a `.env.local` file in the project root:

```bash
# Primary LLM — classification + chat (Required)
GEMINI_API_KEY=your_gemini_api_key_here

# First fallback LLM (Optional but recommended)
OPENAI_API_KEY=your_openai_api_key_here

# Semantic embeddings + BART-MNLI + Mistral chat fallback (Required)
HF_API_KEY=your_huggingface_api_key_here

# Higher PubMed rate limits (Optional but recommended)
NCBI_API_KEY=your_ncbi_api_key_here

# Override Gemini model (Optional, default: gemini-2.0-flash)
GEMINI_MODEL=gemini-2.0-flash
```

**Where to get each key:**
| Variable | Source |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API Key |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `HF_API_KEY` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) → New Token |
| `NCBI_API_KEY` | [ncbi.nlm.nih.gov/account](https://www.ncbi.nlm.nih.gov/account/) → API Key Management |

---

## 8. Fallback Chains

### Classification Fallback Chain

```
Incoming classification request
            │
            ▼
  ┌─────────────────────┐
  │  Gemini 2.0 Flash   │──── Success ──► return JSON classifications
  └──────────┬──────────┘
             │ Fail / 429 (cached 60 min)
             ▼
  ┌─────────────────────┐
  │   GPT-4.1 Mini      │──── Success ──► return JSON classifications
  └──────────┬──────────┘
             │ Fail / 429 (cached 5 min)
             ▼
  ┌─────────────────────┐
  │  BART-large-MNLI    │──── Success ──► return NLI scores
  │  (HuggingFace)      │    (support≥0.60, oppose≥0.55)
  └──────────┬──────────┘
             │ Fail / 503 cold start
             ▼
  ┌─────────────────────┐
  │  Local Heuristic    │──── Always succeeds
  │  Keyword Classifier │    max confidence: 0.75
  └─────────────────────┘
```

### Chat Fallback Chain

```
Incoming chat request
            │
            ▼
  ┌─────────────────────┐
  │  Gemini 2.0 Flash   │──── Success ──► stream response
  │  (multi-turn)       │
  └──────────┬──────────┘
             │ Any error
             ▼
  ┌─────────────────────┐
  │   GPT-4.1 Mini      │──── Success ──► return response
  │  (ctx: 6000 chars)  │    history: last 6 turns
  └──────────┬──────────┘
             │ Any error
             ▼
  ┌─────────────────────┐
  │  Mistral-7B-Instruct│──── Success ──► return response
  │  (HuggingFace)      │    timeout: 25s, max 600 tokens
  └──────────┬──────────┘
             │ Any error / timeout
             ▼
  ┌─────────────────────┐
  │  Local Evidence     │──── Always succeeds
  │  Summary            │    shows formatted paper list with PMIDs
  └─────────────────────┘
```

---

## 9. Key Design Decisions

### Why BM25 + Semantic instead of just one?

BM25 excels at **exact keyword matching** — if you search "metformin longevity", BM25 will score papers that literally contain those words highly. But it misses synonyms ("aging" instead of "longevity") and conceptual closeness.

Semantic embeddings (`all-MiniLM-L6-v2`) excel at **conceptual similarity** — it understands that "age-related decline" is semantically close to "longevity aging". But it can miss specific technical terms that don't appear often in training data.

**RRF fusion** gives you the best of both: a document that ranks high in both lists gets the strongest boost, while a document that only ranks high in one still gets some credit.

### Why RRF instead of score interpolation?

Score interpolation (e.g., `0.5 × bm25_score + 0.5 × semantic_score`) requires normalizing scores from two different scales — BM25 scores can range from 0 to 50+, while cosine similarities are 0 to 1. This normalization is fragile and query-dependent.

RRF only uses **rank positions**, which are already on the same scale (1st, 2nd, 3rd...). The constant `k=60` prevents top-ranked documents from dominating and was empirically validated across many retrieval benchmarks (Robertson 2009).

### Why a 4-tier NLI fallback?

Medical research is high-stakes and rate limits are real. If Gemini is at quota during a demo, the system falls back to OpenAI, then to BART-MNLI (a proper zero-shot NLI model trained on natural language inference), then to keyword heuristics. The user never sees a broken or empty page.

### Why top-8 abstracts?

It balances:
- **Too few (≤5):** might miss important opposing papers
- **Too many (≥15):** classification is slow and expensive; UI becomes overwhelming
- **8:** fits comfortably in the 3-column grid, classification finishes in ~3–5 seconds

### Why `useSearchParams` instead of server props for the search query?

During client-side navigation (clicking a predefined query chip), Next.js streams server-side props and the `initialQuery` prop may arrive late or empty. Reading from `useSearchParams()` directly hits the URL (always current and synchronous on the client) so the search fires immediately without a flash of the empty state.

---

## 10. File Structure

```
app/api/search/route.ts  (~450 lines)
  buildPubMedQuery()         Stop-word removal, Boolean PubMed syntax
  fetchFromPubMed()          esearch + efetch NCBI calls, XML parsing
  parseArticles()            XML → Article[] objects
  bm25Score()                Okapi BM25 (k₁=1.5, b=0.75, title 2×)
  semanticRank()             HuggingFace all-MiniLM-L6-v2 cosine sim
  rerankWithRRF()            RRF fusion (k=60), top-8 selection
  classifyLocally()          Keyword heuristic fallback (always works)
  classifyWithHuggingFace()  BART-large-MNLI zero-shot NLI
  classifyWithOpenAI()       GPT-4.1-mini batch JSON classifier
  classifyWithGemini()       Gemini 2.0 Flash batch JSON classifier
  classifyAbstracts()        Orchestrates the full 4-tier fallback chain
  POST handler               Entry point — ties everything together

app/api/chat/route.ts  (~270 lines)
  buildAbstractContext()     Formats 8 abstracts into structured evidence text
  buildSystemPrompt()        "Dr. Evidence" persona + evidence base injection
  callGemini()               Gemini multi-turn conversation
  POST handler               Orchestrates Gemini → OpenAI → Mistral → local fallbacks

app/search/_components/
  ResultsClient.tsx          Search bar, stats bar, 3-column results grid, loading skeletons
  AbstractCard.tsx           Individual paper card (expand/collapse, MeSH, PMID link)
  ChatDrawer.tsx             Slide-in AI chat panel, evidence sidebar, citation highlighting

app/page.tsx
  LandingPage                Hero section, search bar, animated scientist character
  ScientistCharacter         SVG character (float + wave animations, speech bubble)
  handleExample()            Predefined query chips → navigate to /search?q=...

app/workflow/page.tsx
  Animated pipeline diagram  Node-by-node visualization of the retrieval + classification flow
  Live data flow animations  Shows data moving between pipeline stages
```

---

## 11. Running Locally

```bash
# 1. Clone the repo
git clone https://github.com/Bhargav1026/medsearch-ai.git
cd medsearch-ai

# 2. Install dependencies
npm install

# 3. Set up environment variables
# Create .env.local and add your API keys (see Section 7)

# 4. Start the development server
npm run dev

# 5. Open in browser
# http://localhost:3000
```

**Minimum required keys for basic functionality:**
- `GEMINI_API_KEY` — for NLI classification and chat
- `HF_API_KEY` — for semantic embeddings (`all-MiniLM-L6-v2`) and BART-MNLI fallback

Without `OPENAI_API_KEY`, the system still works — it skips the OpenAI fallback tier.  
Without `NCBI_API_KEY`, PubMed requests are rate-limited to 3 requests/second instead of 10.

---

## 12. What We Achieved

### Technical Achievements

| Achievement | Details |
|---|---|
| **Zero-dependency BM25** | Full Okapi BM25 in TypeScript — IDF, TF saturation, length normalization, title boost |
| **Hybrid retrieval pipeline** | BM25 + sentence-transformer embeddings fused with Reciprocal Rank Fusion |
| **4-tier NLI classifier** | Gemini → GPT-4.1 Mini → BART-MNLI → keyword heuristic, never crashes |
| **4-tier RAG chat** | Gemini → GPT-4.1 Mini → Mistral-7B → local summary fallback |
| **Evidence-grounded chat** | "Dr. Evidence" persona with real-time PMID citation extraction + card highlighting |
| **Sub-5-second results** | Parallel classification calls, early-exit on fast fallback |
| **Rate-limit resilience** | 429 failures cached (60 min Gemini / 5 min OpenAI) to avoid repeated dead calls |
| **Graceful semantic fallback** | If HuggingFace embedding API is down, silently falls back to BM25-only with correct UI badge |

### UX Achievements

| Achievement | Details |
|---|---|
| **Stance-aware 3-column UI** | Instantly see which papers support vs. oppose your hypothesis |
| **Live retrieval stats** | Latency (ms), method badge (Hybrid/BM25), stance counts — all real measured values |
| **Expandable abstracts** | Read full text inline without leaving the page |
| **Skeleton loading states** | Immediate visual feedback during the retrieval pipeline |
| **Sticky nav + search bar** | Always accessible regardless of scroll position |
| **Animated pipeline page** | Step-by-step visualization of every stage with data flow animations |
| **One-shot intro splash** | Shown once per session via sessionStorage — not annoying on repeat visits |
| **Animated scientist character** | Friendly floating SVG beside the search bar — thumbs up + speech bubble |

### Research Value

MedSearch AI demonstrates that **stance-aware medical literature retrieval** is practically achievable with:
- Public APIs only (no private medical databases or GPU compute)
- 4-tier resilient fallbacks (survives rate limits and cold starts)
- Under 5 seconds end-to-end latency in typical conditions
- Genuine disagreement surfacing — something standard search hides by burying opposing papers

---

## Authors

**Bhargava Sai Vardhan Gunapu** & **Karthik Nalluri**

*Powered by PubMed · Okapi BM25 · RRF · Medical NLI · RAG*
