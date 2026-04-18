"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  FlaskConical,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MessageSquare,
  ArrowLeft,
  Zap,
  Clock,
  Database,
} from "lucide-react";
import { AbstractCard, type Abstract } from "./AbstractCard";
import { ChatDrawer } from "./ChatDrawer";

interface SearchResponse {
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

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border-dim p-4 flex flex-col gap-3" style={{ background: "#0c1630" }}>
      <div className="flex justify-between">
        <div className="skeleton h-5 w-24 rounded-full" />
        <div className="skeleton h-5 w-16 rounded" />
      </div>
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-4/5 rounded" />
      <div className="skeleton h-3 w-2/3 rounded" />
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-3/4 rounded" />
    </div>
  );
}

const STANCE_HEADERS = {
  support: {
    icon: CheckCircle2,
    label: "Supporting",
    color: "text-support",
    bg: "bg-support-bg",
    border: "border-support-border",
    dot: "#34d399",
    headerGlow: "rgba(52,211,153,0.12)",
  },
  oppose: {
    icon: XCircle,
    label: "Opposing",
    color: "text-oppose",
    bg: "bg-oppose-bg",
    border: "border-oppose-border",
    dot: "#fb7185",
    headerGlow: "rgba(251,113,133,0.12)",
  },
  neutral: {
    icon: MinusCircle,
    label: "Neutral / Mechanistic",
    color: "text-neut",
    bg: "bg-neut-bg",
    border: "border-neut-border",
    dot: "#a78bfa",
    headerGlow: "rgba(167,139,250,0.12)",
  },
};

interface Props {
  initialQuery: string;
}

export function SearchResultsClient({ initialQuery }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Source of truth: URL param (works on client after hydration)
  const urlQuery = searchParams.get("q") ?? "";
  // Prefer URL param (always current) over server prop (may lag during streaming)
  const activeQuery = urlQuery || initialQuery;

  const [inputValue, setInputValue] = useState(activeQuery);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedQuery = useRef("");

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    lastFetchedQuery.current = q;

    setLoading(true);
    setLoadingStage(0);
    setError("");
    setData(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setData(json as SearchResponse);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "Search failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Multi-stage loading progress
  useEffect(() => {
    if (!loading) { setLoadingStage(0); return; }
    // Stage 0 → 1 after ~1.5s (PubMed fetch usually done)
    const t1 = setTimeout(() => setLoadingStage(1), 1500);
    // Stage 1 → 2 after ~3.5s (re-ranking done)
    const t2 = setTimeout(() => setLoadingStage(2), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading]);

  // Fire search whenever the URL query changes (covers initial load + re-search)
  useEffect(() => {
    if (activeQuery && activeQuery !== lastFetchedQuery.current) {
      setInputValue(activeQuery);
      fetchResults(activeQuery);
    }
  }, [activeQuery, fetchResults]);

  // Show loading skeleton if URL has query but we haven't fetched yet
  const isLoading = loading || (!!activeQuery && !data && !error && lastFetchedQuery.current !== activeQuery);

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = inputValue.trim();
    if (!q || q === activeQuery) return;
    router.push(`/search?q=${encodeURIComponent(q)}`, { scroll: false });
    // fetchResults will be triggered by the useEffect watching activeQuery
  }

  const allAbstracts = data
    ? [...data.results.support, ...data.results.oppose, ...data.results.neutral]
    : [];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top nav bar */}
      <header
        className="sticky top-0 z-20 flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-border"
        style={{ background: "rgba(4,9,26,0.92)", backdropFilter: "blur(12px)" }}
      >
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 shrink-0 text-muted-text hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="hidden sm:block text-sm font-semibold text-foreground">MedSearch AI</span>
        </button>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
          <div
            className="relative flex items-center rounded-xl border transition-all"
            style={{
              borderColor: inputFocused ? "rgba(56,189,248,0.5)" : "#1a3060",
              background: "#070e22",
              boxShadow: inputFocused ? "0 0 0 1px rgba(56,189,248,0.2)" : "none",
            }}
          >
            <Search className="absolute left-3 w-4 h-4 text-muted-text" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className="flex-1 bg-transparent pl-9 pr-20 py-2.5 text-sm text-foreground placeholder:text-muted-text outline-none"
              placeholder="Search medical literature..."
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="absolute right-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "#38bdf8", color: "#04091a" }}
            >
              Search
            </button>
          </div>
        </form>

        {/* Pipeline link */}
        <a
          href="/workflow"
          className="shrink-0 hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium transition-all hover:border-primary hover:text-primary"
          style={{ color: "#38bdf8", borderColor: "rgba(56,189,248,0.3)" }}
        >
          <Zap className="w-3.5 h-3.5" />
          Pipeline
        </a>

        {/* Chat button */}
        <button
          onClick={() => setChatOpen(true)}
          disabled={!data || isLoading}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-medium text-muted-text hover:text-primary hover:border-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:block">Ask AI</span>
          {data && (
            <span
              className="w-2 h-2 rounded-full bg-support animate-pulse"
              title="Evidence loaded"
            />
          )}
        </button>
      </header>

      {/* Stats bar */}
      {data && !isLoading && (
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 px-4 sm:px-6 py-2 border-b border-border-dim text-xs text-muted-text"
          style={{ background: "#070e22" }}
        >
          {/* Left: counts */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3" />
              <span>
                <strong className="text-foreground">{data.totalFound}</strong> abstracts
              </span>
            </div>
            <span className="text-border hidden sm:block">|</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-support" />
              <strong className="text-support">{data.results.support.length}</strong> supporting
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-oppose" />
              <strong className="text-oppose">{data.results.oppose.length}</strong> opposing
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-neut" />
              <strong className="text-neut">{data.results.neutral.length}</strong> neutral
            </span>
          </div>
          {/* Right: timings */}
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: data.retrievalMethod === "hybrid" ? "rgba(56,189,248,0.12)" : "rgba(167,139,250,0.12)",
                border: `1px solid ${data.retrievalMethod === "hybrid" ? "rgba(56,189,248,0.3)" : "rgba(167,139,250,0.3)"}`,
                color: data.retrievalMethod === "hybrid" ? "#38bdf8" : "#a78bfa",
              }}
            >
              {data.retrievalMethod === "hybrid" ? "⚡ BM25 + Semantic (RRF)" : data.retrievalMethod === "bm25" ? "BM25" : "NCBI"}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" />
              {data.retrievalMs}ms retrieval
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-neut" />
              {data.classificationMs}ms classification
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-4 sm:px-6 py-6">
        {/* Error */}
        {error && (
          <div className="max-w-md mx-auto mt-12 rounded-xl border border-oppose-border bg-oppose-bg p-5 text-center">
            <XCircle className="w-8 h-8 text-oppose mx-auto mb-2" />
            <p className="text-sm text-oppose">{error}</p>
            <button
              onClick={() => fetchResults(activeQuery)}
              className="mt-3 text-xs text-muted-text hover:text-foreground transition-colors underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <>
            {/* Multi-stage loading indicator */}
            <div className="flex flex-col items-center gap-3 mb-6">
              {/* Stage pills */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {[
                  { label: "Fetching PubMed abstracts", icon: Database },
                  { label: "Re-ranking with BM25 + Semantic", icon: Zap },
                  { label: "Classifying stance with AI", icon: FlaskConical },
                ].map(({ label, icon: Icon }, i) => {
                  const done = loadingStage > i;
                  const active = loadingStage === i;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border transition-all duration-500"
                      style={{
                        background: done
                          ? "rgba(52,211,153,0.10)"
                          : active
                          ? "rgba(56,189,248,0.10)"
                          : "#070e22",
                        borderColor: done
                          ? "rgba(52,211,153,0.35)"
                          : active
                          ? "rgba(56,189,248,0.35)"
                          : "#1a3060",
                        color: done ? "#34d399" : active ? "#38bdf8" : "#475569",
                      }}
                    >
                      {done ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : active ? (
                        <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Skeleton grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {(["support", "oppose", "neutral"] as const).map((stance) => {
                const cfg = STANCE_HEADERS[stance];
                return (
                  <div key={stance} className="flex flex-col gap-3">
                    <div
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${cfg.border} ${cfg.bg}`}
                    >
                      <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Results grid */}
        {data && !isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(["support", "oppose", "neutral"] as const).map((stance) => {
              const cfg = STANCE_HEADERS[stance];
              const items = data.results[stance];

              return (
                <div key={stance} className="flex flex-col gap-3 animate-slide-up">
                  {/* Column header */}
                  <div
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${cfg.border} ${cfg.bg} sticky top-[58px] z-10`}
                    style={{
                      backdropFilter: "blur(12px)",
                      boxShadow: `0 4px 20px ${cfg.headerGlow}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color}`}
                      style={{
                        background: `${cfg.headerGlow}`,
                        border: `1px solid ${cfg.dot}33`,
                      }}
                    >
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  {items.length === 0 ? (
                    <div
                      className="rounded-xl border border-border-dim p-6 text-center"
                      style={{ background: "#070e22" }}
                    >
                      <cfg.icon className={`w-8 h-8 ${cfg.color} opacity-30 mx-auto mb-2`} />
                      <p className="text-xs text-muted-text">
                        No {cfg.label.toLowerCase()} abstracts found
                      </p>
                    </div>
                  ) : (
                    items.map((abstract, i) => (
                      <AbstractCard key={abstract.pmid} abstract={abstract} index={i} />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !data && !error && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <FlaskConical className="w-12 h-12 text-muted-text opacity-30 mb-4" />
            <p className="text-muted-text text-sm">Enter a query to search PubMed abstracts</p>
          </div>
        )}
      </main>

      {/* Chat drawer */}
      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        query={activeQuery}
        abstracts={allAbstracts}
      />
    </div>
  );
}
