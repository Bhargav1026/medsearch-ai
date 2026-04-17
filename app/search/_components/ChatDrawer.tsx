"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  X,
  Bot,
  User,
  FlaskConical,
  Loader2,
  ExternalLink,
  Lightbulb,
  ChevronDown,
  CheckCircle2,
  XCircle,
  MinusCircle,
  BookOpen,
} from "lucide-react";
import type { Abstract } from "./AbstractCard";

interface Message {
  role: "user" | "assistant";
  content: string;
  citedPmids?: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  abstracts: Abstract[];
}

type StanceFilter = "all" | "support" | "oppose" | "neutral";

const SUGGESTED_QUESTIONS = [
  "Give me just the one strongest supporting paper",
  "What are the real risks — be specific",
  "Why do these studies contradict each other?",
  "Compare the best supporting vs opposing study",
  "How reliable is this evidence overall?",
  "What would a clinician actually do with this?",
];

const STANCE_CONFIG = {
  support: {
    icon: CheckCircle2,
    label: "Supporting",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.25)",
    pill: "rgba(52,211,153,0.12)",
    text: "#34d399",
  },
  oppose: {
    icon: XCircle,
    label: "Opposing",
    color: "#fb7185",
    bg: "rgba(251,113,133,0.08)",
    border: "rgba(251,113,133,0.25)",
    pill: "rgba(251,113,133,0.12)",
    text: "#fb7185",
  },
  neutral: {
    icon: MinusCircle,
    label: "Neutral",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.25)",
    pill: "rgba(167,139,250,0.12)",
    text: "#a78bfa",
  },
};

// ── Inline markdown renderer ──────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[PMID:\d+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="text-xs px-1 py-0.5 rounded font-mono" style={{ background: "#1a3060", color: "#38bdf8" }}>
          {part.slice(1, -1)}
        </code>
      );
    if (/^\[PMID:\d+\]$/.test(part)) {
      const pmid = part.match(/\d+/)?.[0];
      return (
        <a
          key={i}
          href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-mono text-xs font-semibold rounded px-1 py-0.5 transition-colors"
          style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
          title={`Open PMID ${pmid} on PubMed`}
        >
          {part}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function formatResponse(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === "---") { nodes.push(<hr key={i} className="border-border my-3" />); i++; continue; }
    if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**")) {
      nodes.push(<p key={i} className="font-bold text-foreground mt-4 mb-1 text-sm">{line.slice(2, -2)}</p>);
      i++; continue;
    }
    if (line.startsWith("• ") || line.startsWith("- ")) {
      nodes.push(
        <div key={i} className="flex gap-2 items-start my-1">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span className="text-sm text-foreground/90 leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }
    const numMatch = line.match(/^(\d+)\.\s(.+)/);
    if (numMatch) {
      nodes.push(
        <div key={i} className="flex gap-2 items-start my-1">
          <span className="text-xs font-bold text-background rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#38bdf8" }}>{numMatch[1]}</span>
          <span className="text-sm text-foreground/90 leading-relaxed">{renderInline(numMatch[2])}</span>
        </div>
      );
      i++; continue;
    }
    if (line.trim() === "") { nodes.push(<div key={i} className="h-2" />); i++; continue; }
    nodes.push(<p key={i} className="text-sm text-foreground/90 leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return nodes;
}

// ── Compact evidence card for sidebar ────────────────────────────────────────
function EvidenceCard({ abstract, cited }: { abstract: Abstract; cited: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STANCE_CONFIG[abstract.stance];
  const Icon = cfg.icon;
  const author = abstract.authors[0] ? abstract.authors[0] + (abstract.authors.length > 1 ? " et al." : "") : "";
  const pct = Math.round(abstract.confidence * 100);

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2 transition-all duration-200"
      style={{
        background: cited ? "rgba(56,189,248,0.07)" : cfg.bg,
        border: `1px solid ${cited ? "rgba(56,189,248,0.5)" : cfg.border}`,
        boxShadow: cited ? "0 0 12px rgba(56,189,248,0.15)" : "none",
      }}
    >
      {/* Stance + confidence + PMID */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: cfg.text, background: cfg.pill }}>
          <Icon className="w-2.5 h-2.5" />
          {cfg.label}
        </span>
        <div className="flex items-center gap-2">
          {/* Confidence bar */}
          <div className="flex items-center gap-1">
            <div className="w-10 h-1 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cfg.color }} />
            </div>
            <span className="text-[9px] text-muted-text font-mono">{pct}%</span>
          </div>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${abstract.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors"
            style={{ color: cited ? "#38bdf8" : "#64748b", background: cited ? "rgba(56,189,248,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${cited ? "rgba(56,189,248,0.3)" : "#1e293b"}` }}
            title="Open in PubMed"
          >
            {abstract.pmid}
            <ExternalLink className="w-2 h-2" />
          </a>
        </div>
      </div>

      {/* Title */}
      <p className={`text-xs font-semibold text-foreground leading-snug ${!expanded ? "line-clamp-2" : ""}`}>
        {abstract.title}
      </p>

      {/* Meta */}
      <p className="text-[10px] text-muted-text">
        <span className="text-foreground/60">{abstract.journal}</span>
        {" · "}{abstract.year}
        {author && <> · {author}</>}
      </p>

      {/* Excerpt (collapsed by default) */}
      {expanded && (
        <p className="text-[11px] text-muted-text leading-relaxed border-t border-border-dim pt-2 mt-1">
          {abstract.excerpt.slice(0, 400)}{abstract.excerpt.length > 400 ? "…" : ""}
        </p>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className="text-[10px] text-muted-text hover:text-primary transition-colors self-start"
      >
        {expanded ? "▲ Less" : "▼ Read abstract"}
      </button>

      {cited && (
        <div className="flex items-center gap-1 text-[9px] text-primary font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Cited in AI response
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ChatDrawer({ isOpen, onClose, query, abstracts }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [stanceFilter, setStanceFilter] = useState<StanceFilter>("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get PMIDs cited in the last AI message
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant");
  const activeCitedPmids = new Set(lastAssistantMsg?.citedPmids ?? []);

  const supportCount = abstracts.filter(a => a.stance === "support").length;
  const opposeCount  = abstracts.filter(a => a.stance === "oppose").length;
  const neutralCount = abstracts.filter(a => a.stance === "neutral").length;

  const filteredAbstracts = stanceFilter === "all"
    ? abstracts
    : abstracts.filter(a => a.stance === stanceFilter);

  // Sort: cited first, then by confidence
  const sortedAbstracts = [...filteredAbstracts].sort((a, b) => {
    const aCited = activeCitedPmids.has(a.pmid) ? 1 : 0;
    const bCited = activeCitedPmids.has(b.pmid) ? 1 : 0;
    if (bCited !== aCited) return bCited - aCited;
    return b.confidence - a.confidence;
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 350);
      if (messages.length === 0) {
        setMessages([{
          role: "assistant",
          content: `I've got **${abstracts.length} papers** on **"${query}"** in front of me — ${supportCount} supporting, ${opposeCount} opposing, ${neutralCount} neutral.\n\nAsk me anything specific: name a paper, ask about risks, request the strongest evidence, or ask why studies disagree. I'll cite every claim with a PMID you can click to verify.`,
        }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setShowSuggestions(false);
    const userMsg: Message = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, message: q, history: messages.map(({ role, content }) => ({ role, content })), abstracts }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response, citedPmids: data.citedPmids }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const FILTER_TABS: { key: StanceFilter; label: string; count: number; color: string }[] = [
    { key: "all",     label: "All",        count: abstracts.length, color: "#94a3b8" },
    { key: "support", label: "Supporting", count: supportCount,     color: "#34d399" },
    { key: "oppose",  label: "Opposing",   count: opposeCount,      color: "#fb7185" },
    { key: "neutral", label: "Neutral",    count: neutralCount,     color: "#a78bfa" },
  ];

  return (
    <>
      {/* Full-screen overlay — no wasted backdrop space */}
      <div
        className={`fixed inset-0 z-40 flex transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full pointer-events-none"
        }`}
        style={{ background: "#04091a" }}
      >

        {/* ── LEFT: Chat panel ─────────────────────────────────────────── */}
        <div className="flex flex-col border-r border-border" style={{ width: "55%", minWidth: 0 }}>

          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0" style={{ background: "#070e22" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,rgba(56,189,248,0.2),rgba(167,139,250,0.2))", border: "1px solid rgba(56,189,248,0.3)" }}>
                <FlaskConical className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Evidence Expert</p>
                <p className="text-[11px] text-muted-text">Grounded in {abstracts.length} retrieved abstracts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] text-support font-medium" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-support animate-pulse" />
                Evidence loaded
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-text hover:text-foreground hover:bg-surface-2 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Query context bar */}
          <div className="px-5 py-3 border-b border-border-dim shrink-0" style={{ background: "#070e22" }}>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "#0c1630", border: "1px solid #1a3060" }}>
              <span className="text-xs text-muted-text shrink-0">Query:</span>
              <span className="text-sm font-medium text-primary flex-1 truncate">"{query}"</span>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-support" /><span className="text-support font-semibold">{supportCount}</span></span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oppose" /><span className="text-oppose font-semibold">{opposeCount}</span></span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neut" /><span className="text-neut font-semibold">{neutralCount}</span></span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={msg.role === "assistant"
                    ? { background: "linear-gradient(135deg,rgba(56,189,248,0.2),rgba(129,140,248,0.2))", border: "1px solid rgba(56,189,248,0.3)" }
                    : { background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }
                  }
                >
                  {msg.role === "assistant" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-neut" />}
                </div>
                <div
                  className={`rounded-2xl px-5 py-4 ${msg.role === "user" ? "max-w-[80%]" : "max-w-full w-full"}`}
                  style={msg.role === "user"
                    ? { background: "#1e3a6e", border: "1px solid rgba(167,139,250,0.2)" }
                    : { background: "#0a1628", border: "1px solid #1a3060" }
                  }
                >
                  {msg.role === "assistant"
                    ? <div className="flex flex-col gap-0.5">{formatResponse(msg.content)}</div>
                    : <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                  }
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,rgba(56,189,248,0.2),rgba(129,140,248,0.2))", border: "1px solid rgba(56,189,248,0.3)" }}>
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: "#0a1628", border: "1px solid #1a3060" }}>
                  <div className="flex gap-1">
                    {[0,1,2].map(j => (
                      <div key={j} className="w-2 h-2 rounded-full bg-primary opacity-60" style={{ animation: "bounce 1.2s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-text">Synthesizing from evidence…</span>
                </div>
              </div>
            )}

            {showSuggestions && messages.length <= 1 && !loading && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-text">
                  <Lightbulb className="w-3 h-3" />
                  Suggested questions
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTED_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="text-left text-xs px-3 py-2.5 rounded-xl border border-border-dim text-muted-text hover:text-primary hover:border-primary transition-all leading-snug"
                      style={{ background: "#0c1630" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {messages.length > 4 && (
            <button
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-24 right-[46%] w-8 h-8 flex items-center justify-center rounded-full border border-border bg-surface-2 text-muted-text hover:text-foreground transition-colors shadow-lg"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}

          {/* Input area */}
          <div className="px-5 py-4 border-t border-border shrink-0" style={{ background: "#070e22" }}>
            <div
              className="flex items-end gap-3 rounded-2xl border p-3 transition-all"
              style={{ background: "#0c1630", borderColor: "#1a3060" }}
              onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(56,189,248,0.5)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px rgba(56,189,248,0.15)"; }}
              onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#1a3060"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about mechanisms, risks, evidence quality…"
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-text outline-none disabled:opacity-50 py-1"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                style={{ background: "#38bdf8", color: "#04091a" }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-text text-center mt-2">
              Every claim is grounded in the retrieved abstracts — click PMID links to verify
            </p>
          </div>
        </div>

        {/* ── RIGHT: Evidence sidebar ──────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: "45%", minWidth: 0, background: "#060d1f" }}>

          {/* Sidebar header */}
          <div className="px-5 py-4 border-b border-border shrink-0" style={{ background: "#070e22" }}>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Evidence Base</span>
              <span className="text-[10px] text-muted-text ml-auto">{abstracts.length} papers retrieved</span>
            </div>

            {/* Stance filter tabs */}
            <div className="flex gap-1">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStanceFilter(tab.key)}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{
                    background: stanceFilter === tab.key ? `${tab.color}18` : "transparent",
                    border: `1px solid ${stanceFilter === tab.key ? tab.color + "55" : "transparent"}`,
                    color: stanceFilter === tab.key ? tab.color : "#64748b",
                  }}
                >
                  <span className="text-base font-bold" style={{ color: stanceFilter === tab.key ? tab.color : "#64748b" }}>{tab.count}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cited-papers notice */}
          {activeCitedPmids.size > 0 && (
            <div className="mx-4 mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-[11px] text-primary shrink-0" style={{ background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.2)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              {activeCitedPmids.size} paper{activeCitedPmids.size > 1 ? "s" : ""} cited in last response — highlighted below
            </div>
          )}

          {/* Paper list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
            {sortedAbstracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-text text-sm gap-2 opacity-50">
                <MinusCircle className="w-8 h-8" />
                No papers in this category
              </div>
            ) : (
              sortedAbstracts.map(abstract => (
                <EvidenceCard
                  key={abstract.pmid}
                  abstract={abstract}
                  cited={activeCitedPmids.has(abstract.pmid)}
                />
              ))
            )}
          </div>

          {/* Sidebar footer */}
          <div className="px-4 py-3 border-t border-border shrink-0 text-[10px] text-muted-text text-center" style={{ background: "#070e22" }}>
            Click any PMID to open full paper on PubMed
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
