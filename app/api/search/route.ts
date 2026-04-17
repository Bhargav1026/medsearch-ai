import { NextRequest } from "next/server";

// Vercel: extend serverless timeout to 60s
export const maxDuration = 60;

export interface Abstract {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  excerpt: string;
  meshTerms: string[];
  score: number;
  stance: "support" | "oppose" | "neutral";
  confidence: number;
}

export interface SearchResponse {
  query: string;
  totalFound: number;
  retrievalMs: number;
  classificationMs: number;
  retrievalMethod: "hybrid" | "bm25" | "ncbi";
  results: {
    support: Abstract[];
    oppose: Abstract[];
    neutral: Abstract[];
  };
}

interface RawArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  year: number;
  meshTerms: string[];
}

type Classification = { pmid: string; stance: "support" | "oppose" | "neutral"; confidence: number };

// ── PubMed helpers ────────────────────────────────────────────────────────────

function cleanXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#xa0;/gi, " ")
    .replace(/&#\d+;/g, " ").replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function buildPubMedQuery(query: string): string {
  const STOP = new Set(["and","or","the","a","an","of","in","for","with","to","on","at","by","is","are","was","were","be","has","have","do","does","did","not","no","vs","versus"]);
  const parts = query.toLowerCase().split(/\s+(?:and|or)\s+/i);
  if (parts.length > 1) return parts.map(p => `"${p.trim()}"[Title/Abstract]`).join(" AND ");
  const terms = query.split(/\s+/).filter(t => !STOP.has(t.toLowerCase()) && t.length > 2);
  if (terms.length === 0) return `"${query}"[Title/Abstract]`;
  if (terms.length === 1) return `"${terms[0]}"[Title/Abstract]`;
  return `"${terms.join(" ")}"[Title/Abstract] OR (${terms.map(t => `"${t}"[Title/Abstract]`).join(" AND ")})`;
}

async function searchPubMed(query: string, maxResults = 20): Promise<string[]> {
  const apiKey = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "";
  const term = encodeURIComponent(buildPubMedQuery(query));
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${term}&retmax=${maxResults}&retmode=json&sort=relevance${apiKey}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);
  const data = await res.json();
  return (data?.esearchresult?.idlist as string[]) ?? [];
}

async function fetchAbstracts(ids: string[]): Promise<RawArticle[]> {
  if (ids.length === 0) return [];
  const apiKey = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "";
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml${apiKey}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`);
  return parseArticles(await res.text());
}

function parseArticles(xml: string): RawArticle[] {
  const articles: RawArticle[] = [];
  for (const chunk of xml.split("<PubmedArticle>").slice(1)) {
    try {
      const pmidMatch = chunk.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      if (!pmidMatch) continue;
      const titleMatch = chunk.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
      if (!titleMatch) continue;
      const title = cleanXml(titleMatch[1]);
      if (!title) continue;
      const abstract = [...chunk.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map(m => cleanXml(m[1])).filter(Boolean).join(" ");
      if (!abstract) continue;
      const authors = [...chunk.matchAll(/<Author[^>]*ValidYN="Y"[^>]*>([\s\S]*?)<\/Author>/g)]
        .slice(0, 4).map(m => {
          const last = m[1].match(/<LastName>([\s\S]*?)<\/LastName>/)?.[1] ?? "";
          const init = m[1].match(/<Initials>([\s\S]*?)<\/Initials>/)?.[1] ?? "";
          return cleanXml(`${last} ${init}`).trim();
        }).filter(Boolean);
      const isoMatch = chunk.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/);
      const journalTitleMatch = chunk.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
      const journal = cleanXml(isoMatch?.[1] ?? journalTitleMatch?.[1] ?? "PubMed");
      const yearMatch = chunk.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) ?? chunk.match(/<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      const meshTerms = [...chunk.matchAll(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g)].slice(0, 6).map(m => cleanXml(m[1])).filter(Boolean);
      articles.push({ pmid: pmidMatch[1], title, abstract, authors, journal, year, meshTerms });
    } catch { /* skip malformed */ }
  }
  return articles;
}

// ── BM25 (local, no external library) ────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function bm25Rank(articles: RawArticle[], query: string): Array<{ article: RawArticle; score: number }> {
  const k1 = 1.5, b = 0.75;
  const queryTerms = tokenize(query);
  const docTokens = articles.map(a => tokenize(`${a.title} ${a.title} ${a.abstract}`)); // title weighted 2x
  const avgDl = docTokens.reduce((s, t) => s + t.length, 0) / (docTokens.length || 1);
  const N = articles.length;

  // Document frequency per query term
  const df: Record<string, number> = {};
  for (const term of queryTerms) {
    df[term] = docTokens.filter(t => t.includes(term)).length;
  }

  return articles.map((article, i) => {
    const tokens = docTokens[i];
    const dl = tokens.length;
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

    let score = 0;
    for (const term of queryTerms) {
      const f = tf[term] || 0;
      if (f === 0) continue;
      const n = df[term] || 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const tfNorm = (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / avgDl));
      score += idf * tfNorm;
    }
    return { article, score };
  }).sort((a, b) => b.score - a.score);
}

// ── Semantic ranking via HuggingFace sentence-similarity pipeline ─────────────
// Uses all-MiniLM-L6-v2 — returns cosine similarity scores directly (no local math needed)

async function semanticRank(articles: RawArticle[], query: string): Promise<Array<{ article: RawArticle; score: number }>> {
  const hfToken = process.env.HF_API_KEY;
  if (!hfToken) throw new Error("HF_API_KEY not set");

  const sentences = articles.map(a => `${a.title}. ${a.abstract.slice(0, 200)}`);

  const res = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: { source_sentence: query, sentences } }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    }
  );

  if (res.status === 503) throw new Error("Embedding model loading");
  if (!res.ok) throw new Error(`HF semantic error: ${res.status}`);

  const scores: number[] = await res.json();
  if (!Array.isArray(scores) || scores.length !== articles.length) throw new Error("Invalid similarity response");

  return articles
    .map((article, i) => ({ article, score: scores[i] }))
    .sort((a, b) => b.score - a.score);
}

// ── Reciprocal Rank Fusion (RRF) ──────────────────────────────────────────────
// Combines BM25 + semantic rankings. k=60 is the standard constant (Robertson 2009).

function reciprocalRankFusion(
  ranked1: Array<{ article: RawArticle; score: number }>,
  ranked2: Array<{ article: RawArticle; score: number }>,
  k = 60
): Array<{ article: RawArticle; rrfScore: number }> {
  const scores = new Map<string, number>();

  ranked1.forEach(({ article }, i) => {
    scores.set(article.pmid, (scores.get(article.pmid) || 0) + 1 / (k + i + 1));
  });
  ranked2.forEach(({ article }, i) => {
    scores.set(article.pmid, (scores.get(article.pmid) || 0) + 1 / (k + i + 1));
  });

  // Build sorted result preserving article references
  const allArticles = new Map<string, RawArticle>();
  [...ranked1, ...ranked2].forEach(({ article }) => allArticles.set(article.pmid, article));

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pmid, rrfScore]) => ({ article: allArticles.get(pmid)!, rrfScore }));
}

// ── Classification ────────────────────────────────────────────────────────────

function buildClassifyPrompt(articles: RawArticle[], query: string): string {
  const abstractsText = articles.map(a =>
    `PMID:${a.pmid}\nTitle: ${a.title}\nAbstract: ${a.abstract.slice(0, 400)}`
  ).join("\n---\n");

  return `You are a strict medical NLI (Natural Language Inference) classifier.

QUERY: "${query}"

For each abstract, decide whether it directly supports, directly opposes, or is neutral toward the SPECIFIC claim in the query.

STRICT RULES:
- "support": The paper reports empirical results that DIRECTLY confirm the query claim (e.g. RCT showing a drug works, cohort study confirming an association). Must be directly relevant AND show a positive result.
- "oppose": The paper reports results that DIRECTLY contradict or refute the query claim (null results, no significant effect, harm shown, failed RCT). Must be directly relevant AND show a negative/null result.
- "neutral": Everything else — review articles, background papers, mechanistic studies, papers only tangentially related to the query, case reports, editorials, or papers about a related but different topic.

IMPORTANT: If the paper doesn't study the EXACT intervention or association in the query, classify it as "neutral" even if it's about the same disease area.

Return ONLY valid JSON, no markdown, no explanation:
[{"pmid":"12345678","stance":"support","confidence":0.88},...]

ABSTRACTS:
${abstractsText}`;
}

function parseClassifyJson(raw: string): Classification[] {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try { return JSON.parse(jsonMatch[0]); } catch { return []; }
}

function classifyLocally(articles: RawArticle[], query: string): Classification[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const SUPPORT = ["significant","significantly","effective","efficacious","benefit","beneficial","reduced","reduction","improved","improvement","protective","lower risk","decreased risk","prevented","favorable","superior","demonstrated","confirmed","supports","evidence for","lower incidence","better outcomes","associated with increased","positive effect","showed benefit"];
  const OPPOSE  = ["no significant","no benefit","no effect","no evidence","no association","no difference","no reduction","no improvement","ineffective","failed","null result","lack of","not associated","adverse","harmful","increased risk","worsened","did not","does not","were not","was not","found no","showed no","insufficient evidence","contradicts","no efficacy"];
  const NEUTRAL = ["review","systematic review","meta-analysis","overview","background","mechanism","pathway","in vitro","animal model","rat model","mouse model","case report","editorial","commentary","perspective","narrative review"];

  return articles.map(a => {
    const text = (a.title + " " + a.abstract).toLowerCase();
    if (NEUTRAL.filter(s => text.includes(s)).length >= 2) return { pmid: a.pmid, stance: "neutral" as const, confidence: 0.65 };
    if (a.abstract.length < 200) return { pmid: a.pmid, stance: "neutral" as const, confidence: 0.60 };
    let opp = OPPOSE.filter(s => text.includes(s)).length * 2;
    let sup = SUPPORT.filter(s => text.includes(s)).length;
    const titleHits = queryTerms.filter(w => a.title.toLowerCase().includes(w)).length;
    if (titleHits >= 2) sup += 1;
    if (opp > sup + 1) return { pmid: a.pmid, stance: "oppose" as const, confidence: Math.min(0.5 + opp * 0.05, 0.75) };
    if (sup > opp + 1) return { pmid: a.pmid, stance: "support" as const, confidence: Math.min(0.5 + sup * 0.05, 0.75) };
    return { pmid: a.pmid, stance: "neutral" as const, confidence: 0.60 };
  });
}

async function classifyWithMedNLI(articles: RawArticle[], query: string): Promise<Classification[]> {
  const hfToken = process.env.HF_API_KEY;
  if (!hfToken) throw new Error("HF_API_KEY not set");
  const url = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli";
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${hfToken}` };

  const classifyOne = async (article: RawArticle): Promise<Classification> => {
    const text = `${article.title}. ${article.abstract.slice(0, 250)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify({ inputs: text, parameters: { candidate_labels: ["supports","contradicts","unrelated"], hypothesis_template: `This abstract {} the claim: ${query}.` } }),
        cache: "no-store", signal: controller.signal,
      });
      if (res.status === 503) throw new Error("NLI model loading");
      if (!res.ok) throw new Error(`HF NLI error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(`HF NLI: ${data.error}`);
      type HFItem = { label: string; score: number };
      let items: HFItem[] = Array.isArray(data) ? data : (data.labels ? (data.labels as string[]).map((l: string, i: number) => ({ label: l, score: data.scores[i] })) : []);
      const getScore = (kw: string) => items.find(r => r.label.toLowerCase().includes(kw))?.score ?? 0;
      const sup = getScore("supports"), opp = getScore("contradicts"), neu = getScore("unrelated");
      const max = Math.max(sup, opp, neu);
      if (max === sup && sup >= 0.60) return { pmid: article.pmid, stance: "support", confidence: parseFloat(sup.toFixed(2)) };
      if (max === opp && opp >= 0.55) return { pmid: article.pmid, stance: "oppose", confidence: parseFloat(opp.toFixed(2)) };
      return { pmid: article.pmid, stance: "neutral", confidence: parseFloat((neu || (1 - max)).toFixed(2)) };
    } finally { clearTimeout(timer); }
  };

  const settled = await Promise.allSettled(articles.map(classifyOne));
  let failures = 0;
  const results: Classification[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    failures++;
    return { pmid: articles[i].pmid, stance: "neutral" as const, confidence: 0 };
  });
  if (failures > articles.length / 2) throw new Error(`NLI: too many failures (${failures}/${articles.length})`);
  return results;
}

let geminiQuotaExhaustedUntil = 0;
async function classifyWithGemini(articles: RawArticle[], query: string): Promise<Classification[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  if (Date.now() < geminiQuotaExhaustedUntil) throw new Error("Gemini quota exhausted (cached)");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: buildClassifyPrompt(articles, query) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2048 } }), cache: "no-store" }
  );
  if (res.status === 429) {
    const errData = await res.json().catch(() => ({}));
    const retryDelay = errData?.error?.details?.find((d: {retryDelay?: string}) => d.retryDelay)?.retryDelay?.replace("s","") ?? 0;
    if (Number(retryDelay) > 30) geminiQuotaExhaustedUntil = Date.now() + 60 * 60 * 1000;
    throw new Error("Gemini rate limited");
  }
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`Gemini API error: ${data.error.message}`);
  const raw: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const parsed = parseClassifyJson(raw);
  if (parsed.length === 0) throw new Error("Gemini returned empty classification");
  return parsed;
}

let openaiQuotaExhaustedUntil = 0;
async function classifyWithOpenAI(articles: RawArticle[], query: string): Promise<Classification[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  if (Date.now() < openaiQuotaExhaustedUntil) throw new Error("OpenAI quota exhausted (cached)");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4.1-mini", messages: [{ role: "user", content: buildClassifyPrompt(articles, query) }], temperature: 0.1, max_tokens: 1024 }), cache: "no-store",
  });
  if (res.status === 429) { openaiQuotaExhaustedUntil = Date.now() + 5 * 60 * 1000; throw new Error("OpenAI rate limited"); }
  if (!res.ok) throw new Error(`OpenAI classify failed: ${res.status}`);
  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  const parsed = parseClassifyJson(raw);
  if (parsed.length === 0) throw new Error("OpenAI returned empty classification");
  return parsed;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: { query?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const query: string = typeof body.query === "string" ? body.query : "";
  if (!query.trim()) return Response.json({ error: "Query required" }, { status: 400 });
  if (query.length > 500) return Response.json({ error: "Query too long. Please keep it under 500 characters." }, { status: 400 });

  const retrievalStart = Date.now();

  // Step 1: Fetch 20 candidates from PubMed (wider net for re-ranking)
  let candidates: RawArticle[] = [];
  try {
    const ids = await searchPubMed(query, 20);
    candidates = await fetchAbstracts(ids);
  } catch {
    try {
      const ids = await searchPubMed(query, 20);
      candidates = await fetchAbstracts(ids);
    } catch {
      return Response.json({ error: "PubMed is temporarily unavailable. Please try again in a moment." }, { status: 502 });
    }
  }

  if (candidates.length === 0) {
    return Response.json({ query, totalFound: 0, retrievalMs: Date.now() - retrievalStart, classificationMs: 0, retrievalMethod: "ncbi", results: { support: [], oppose: [], neutral: [] } });
  }

  // Step 2: BM25 (instant, local) + Semantic embeddings (HF) — run in parallel
  const bm25Ranked = bm25Rank(candidates, query); // instant, local

  let articles: RawArticle[];
  let retrievalMethod: "hybrid" | "bm25" | "ncbi" = "bm25";

  // Try semantic; fall back gracefully if HF is cold-starting or unavailable
  let semanticRanked: Array<{ article: RawArticle; score: number }> | null = null;
  try {
    semanticRanked = await semanticRank(candidates, query);
  } catch {
    semanticRanked = null;
  }

  if (semanticRanked) {
    // Step 3a: Hybrid — RRF fusion of BM25 + semantic
    const fused = reciprocalRankFusion(bm25Ranked, semanticRanked);
    articles = fused.slice(0, 8).map(f => f.article);
    retrievalMethod = "hybrid";
  } else {
    // Step 3b: BM25 only fallback — still better than raw NCBI order
    articles = bm25Ranked.slice(0, 8).map(r => r.article);
    retrievalMethod = "bm25";
  }

  const retrievalMs = Date.now() - retrievalStart;

  // Step 4: Classify top-8 for stance
  const classificationStart = Date.now();
  let classifications: Classification[] = [];
  try { classifications = await classifyWithGemini(articles, query); }
  catch {
    try { classifications = await classifyWithOpenAI(articles, query); }
    catch {
      try { classifications = await classifyWithMedNLI(articles, query); }
      catch { classifications = classifyLocally(articles, query); }
    }
  }
  const classificationMs = Date.now() - classificationStart;

  // Compute normalised RRF scores for display
  const rrfScoreMap = new Map<string, number>();
  if (semanticRanked) {
    reciprocalRankFusion(bm25Ranked, semanticRanked)
      .forEach(({ article, rrfScore }) => rrfScoreMap.set(article.pmid, rrfScore));
  } else {
    bm25Ranked.forEach(({ article, score }, i) => rrfScoreMap.set(article.pmid, 1 / (60 + i + 1)));
  }
  const maxRrf = Math.max(...rrfScoreMap.values(), 1e-9);

  const classified: Abstract[] = articles.map(a => {
    const cls = classifications.find(c => c.pmid === a.pmid);
    const rawScore = rrfScoreMap.get(a.pmid) ?? 0;
    return {
      ...a,
      excerpt: a.abstract,
      stance: cls?.stance ?? "neutral",
      confidence: parseFloat((cls?.confidence ?? 0.6).toFixed(2)),
      score: parseFloat((rawScore / maxRrf).toFixed(3)), // normalised to [0,1]
    };
  });

  const support = classified.filter(a => a.stance === "support").sort((a, b) => b.confidence - a.confidence);
  const oppose  = classified.filter(a => a.stance === "oppose").sort((a, b) => b.confidence - a.confidence);
  const neutral = classified.filter(a => a.stance === "neutral").sort((a, b) => b.confidence - a.confidence);

  return Response.json({
    query,
    totalFound: classified.length,
    retrievalMs,
    classificationMs,
    retrievalMethod,
    results: { support, oppose, neutral },
  } satisfies SearchResponse);
}
