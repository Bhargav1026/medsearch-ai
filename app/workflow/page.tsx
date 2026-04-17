"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  ArrowLeft,
  Search,
  Database,
  Cpu,
  Brain,
  Play,
  RotateCcw,
  Zap,
  GitMerge,
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MessageSquare,
} from "lucide-react";

// ─── Layout constants ──────────────────────────────────────────────────────────
const VW = 960;
const VH = 1160;
const NW = 210;
const NH = 88;

// Node center positions (cx, cy)
const POS = {
  query:    { cx: 480, cy: 64   },
  pubmed:   { cx: 480, cy: 210  },
  bm25:     { cx: 196, cy: 370  },
  semantic: { cx: 764, cy: 370  },
  fusion:   { cx: 480, cy: 540  },
  nli:      { cx: 480, cy: 700  },
  ui:       { cx: 480, cy: 860  },
  llm:      { cx: 480, cy: 1020 },
} as const;

type NodeKey = keyof typeof POS;

// Connection SVG paths (from bottom of "from" to top of "to")
function cubicPath(from: { cx: number; cy: number }, to: { cx: number; cy: number }) {
  const x1 = from.cx, y1 = from.cy + NH / 2;
  const x2 = to.cx,   y2 = to.cy   - NH / 2;
  const mid = (y1 + y2) / 2;
  if (Math.abs(x1 - x2) < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;
  return `M ${x1} ${y1} C ${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

const CONNS: { id: string; from: NodeKey; to: NodeKey; phase: number; color: string }[] = [
  { id: "q-p",  from: "query",    to: "pubmed",    phase: 0, color: "#38bdf8" },
  { id: "p-b",  from: "pubmed",   to: "bm25",      phase: 1, color: "#f59e0b" },
  { id: "p-s",  from: "pubmed",   to: "semantic",  phase: 1, color: "#a78bfa" },
  { id: "b-f",  from: "bm25",     to: "fusion",    phase: 2, color: "#34d399" },
  { id: "s-f",  from: "semantic", to: "fusion",    phase: 2, color: "#34d399" },
  { id: "f-n",  from: "fusion",   to: "nli",       phase: 3, color: "#fb7185" },
  { id: "n-u",  from: "nli",      to: "ui",        phase: 4, color: "#38bdf8" },
  { id: "u-l",  from: "ui",       to: "llm",       phase: 5, color: "#818cf8" },
];

// Node metadata
const NODE_META: Record<NodeKey, {
  label: string; sublabel: string; color: string; phase: number;
  tech: string[]; description: string; output: string; latency: number;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}> = {
  query: {
    label: "User Query", sublabel: "Input & query building", color: "#38bdf8", phase: 0,
    Icon: Search,
    tech: ["Stop-word removal", "Boolean query builder", "PubMed syntax"],
    description: 'The user types a clinical question. Stop-words are stripped and a structured PubMed boolean query is built — e.g. "statins cognitive"[Title/Abstract] OR ("statins"[Title/Abstract] AND "cognitive"[Title/Abstract]). This maximises recall from NCBI E-utilities.',
    output: '"statins cognitive decline" → structured PubMed query string',
    latency: 5,
  },
  pubmed: {
    label: "PubMed Fetch", sublabel: "NCBI E-utilities", color: "#fbbf24", phase: 0,
    Icon: Database,
    tech: ["NCBI esearch API", "NCBI efetch API", "XML parsing", "20 candidates"],
    description: "The PubMed query is sent to NCBI E-utilities in two calls: esearch returns up to 20 matching PMIDs sorted by relevance, then efetch retrieves the full XML for those papers — title, abstract, authors, journal, year, and MeSH terms. Both BM25 and Semantic then re-rank these same 20 candidates.",
    output: "20 raw candidate abstracts with metadata",
    latency: 800,
  },
  bm25: {
    label: "BM25 Re-ranking", sublabel: "Lexical scoring", color: "#f59e0b", phase: 1,
    Icon: FileText,
    tech: ["Okapi BM25 (k₁=1.5, b=0.75)", "IDF weighting", "Title 2× boost", "Local computation"],
    description: "BM25 re-ranks the 20 PubMed candidates using term-frequency × inverse-document-frequency. Article titles are weighted 2× over abstract text — giving precise matches on drug names, gene symbols, and conditions. Runs entirely locally with no external API call — instant.",
    output: "20 candidates ranked by BM25 score",
    latency: 2,
  },
  semantic: {
    label: "Semantic Re-ranking", sublabel: "Dense embedding similarity", color: "#a78bfa", phase: 1,
    Icon: Cpu,
    tech: ["all-MiniLM-L6-v2", "384-dim vectors", "Cosine similarity", "HuggingFace Inference API"],
    description: "The same 20 candidates are scored semantically using sentence-transformers/all-MiniLM-L6-v2 via HuggingFace Inference API. The model computes cosine similarity between the query and each abstract — capturing meaning even when exact terms differ (e.g. 'heart attack' vs 'myocardial infarction').",
    output: "20 candidates ranked by semantic similarity score",
    latency: 2000,
  },
  fusion: {
    label: "RRF Fusion", sublabel: "Reciprocal Rank Fusion", color: "#34d399", phase: 2,
    Icon: GitMerge,
    tech: ["RRF formula: 1/(60+rank)", "Dual-list merge", "Top-8 selection"],
    description: "Reciprocal Rank Fusion combines both ranked lists using score = 1/(60+rank). Papers that rank highly in BOTH the BM25 and semantic lists receive the greatest combined boost — this is the core benefit of hybrid retrieval. The top 8 by RRF score advance to NLI classification.",
    output: "Top 8 papers selected by combined BM25 + Semantic RRF score",
    latency: 2,
  },
  nli: {
    label: "Medical NLI", sublabel: "Stance classification", color: "#fb7185", phase: 3,
    Icon: Brain,
    tech: ["Gemini 2.5 Flash (primary)", "GPT-4.1 Mini (fallback 1)", "bart-large-mnli (fallback 2)", "Local keywords (fallback 3)"],
    description: "Each of the 8 papers is classified as Supporting, Opposing, or Neutral relative to the user's query using Natural Language Inference. Primary classifier is Gemini 2.5 Flash (~2s). Falls back automatically to OpenAI GPT-4.1 Mini, then HuggingFace facebook/bart-large-mnli zero-shot NLI, then a local keyword scorer.",
    output: "8 papers labeled Support | Oppose | Neutral + confidence %",
    latency: 2000,
  },
  ui: {
    label: "Stance-Aware UI", sublabel: "Interactive results display", color: "#38bdf8", phase: 4,
    Icon: FileText,
    tech: ["3-column stance layout", "RRF relevance scores", "Clickable PMID links", "Expandable abstracts"],
    description: "Classified papers render in three columns — Supporting, Opposing, Neutral — sorted by confidence score. Each card shows the normalised RRF relevance score, confidence bar, journal/year/authors, and a direct PubMed link. Users expand abstracts and click PMID badges to verify the source paper.",
    output: "Interactive stance board with real PubMed sources + RRF scores",
    latency: 0,
  },
  llm: {
    label: "RAG + LLM Chat", sublabel: "Evidence-grounded answers", color: "#818cf8", phase: 5,
    Icon: Sparkles,
    tech: ["Gemini 2.5 Flash", "GPT-4.1 Mini fallback", "PMID citation grounding", "Two-panel chat UI"],
    description: "All 8 retrieved abstracts are injected into a structured system prompt. Gemini 2.5 Flash (GPT-4.1 Mini as fallback) answers as a senior medical analyst — citing PMIDs inline, quoting statistics from the abstracts, never hallucinating beyond retrieved evidence. The two-panel UI shows cited papers highlighted in real-time.",
    output: "Cited expert-level answers — every claim links to a verifiable PMID",
    latency: 2000,
  },
};

const PHASE_DELAYS = [0, 300, 600, 1400, 2100, 2900, 4000, 5100];

// ─── SVG Connection with flowing particles ──────────────────────────────────
function Connection({
  from, to, color, active,
}: {
  from: NodeKey; to: NodeKey; color: string; active: boolean;
}) {
  const d = cubicPath(POS[from], POS[to]);
  return (
    <g>
      {/* Base dim path */}
      <path d={d} fill="none" stroke="#1a3060" strokeWidth={2} />

      {/* Active flowing dashes */}
      {active && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="10 8"
          strokeLinecap="round"
          style={{
            animation: "flowDash 0.9s linear infinite",
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
      )}

      {/* Glowing static path when active */}
      {active && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.25}
        />
      )}

      {/* Moving data packets */}
      {active && (
        <>
          <circle r={5} fill={color} opacity={0.95} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
            <animateMotion dur="1.4s" repeatCount="indefinite" path={d} />
          </circle>
          <circle r={3} fill={color} opacity={0.7} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
            <animateMotion dur="1.4s" repeatCount="indefinite" begin="-0.7s" path={d} />
          </circle>
        </>
      )}
    </g>
  );
}

// ─── SVG Node box ────────────────────────────────────────────────────────────
function NodeBox({
  nodeKey, active, selected, onClick,
}: {
  nodeKey: NodeKey; active: boolean; selected: boolean; onClick: () => void;
}) {
  const meta = NODE_META[nodeKey];
  const { cx, cy } = POS[nodeKey];
  const x = cx - NW / 2;
  const y = cy - NH / 2;
  const { color } = meta;

  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={onClick}
    >
      {/* Outer glow ring when active */}
      {active && (
        <rect
          x={x - 6} y={y - 6}
          width={NW + 12} height={NH + 12}
          rx={20} fill="none"
          stroke={color} strokeWidth={1.5}
          opacity={0.3}
          style={{ animation: "pulseRing 2s ease-in-out infinite" }}
        />
      )}

      {/* Selected ring */}
      {selected && (
        <rect
          x={x - 3} y={y - 3}
          width={NW + 6} height={NH + 6}
          rx={17} fill="none"
          stroke={color} strokeWidth={2}
          opacity={0.7}
        />
      )}

      {/* Card background */}
      <rect
        x={x} y={y} width={NW} height={NH} rx={14}
        fill={active ? `url(#bg-${nodeKey})` : "#070e22"}
        stroke={active ? color : "#1a3060"}
        strokeWidth={active ? 2 : 1}
        style={{
          filter: active ? `drop-shadow(0 0 12px ${color}55)` : "none",
          transition: "all 0.5s ease",
        }}
      />

      {/* Gradient def */}
      <defs>
        <linearGradient id={`bg-${nodeKey}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0.04} />
        </linearGradient>
      </defs>

      {/* Icon circle */}
      <circle
        cx={x + 34} cy={cy}
        r={18}
        fill={active ? `${color}22` : "#0c1630"}
        stroke={active ? color : "#1a3060"}
        strokeWidth={1.5}
      />

      {/* Step number */}
      <text
        x={x + 34} y={cy + 5}
        textAnchor="middle"
        fontSize={12}
        fontWeight="bold"
        fill={active ? color : "#475569"}
      >
        {Object.keys(NODE_META).indexOf(nodeKey) + 1}
      </text>

      {/* Label */}
      <text
        x={x + 62} y={cy - 12}
        fontSize={14}
        fontWeight="700"
        fill={active ? color : "#475569"}
        style={{ transition: "fill 0.4s ease" }}
      >
        {meta.label}
      </text>

      {/* Sublabel */}
      <text
        x={x + 62} y={cy + 6}
        fontSize={11}
        fill={active ? "#94a3b8" : "#2d4470"}
      >
        {meta.sublabel}
      </text>

      {/* Latency badge */}
      {meta.latency > 0 && active && (
        <text
          x={x + 62} y={cy + 22}
          fontSize={10}
          fontWeight="600"
          fill={color}
          opacity={0.85}
        >
          ~{meta.latency}ms
        </text>
      )}
    </g>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function WorkflowPage() {
  const router = useRouter();
  const [phase, setPhase] = useState(-1);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<NodeKey>("query");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function isNodeActive(key: NodeKey) {
    return phase >= NODE_META[key].phase;
  }

  function isConnActive(conn: (typeof CONNS)[0]) {
    return phase >= conn.phase;
  }

  function simulate() {
    timers.current.forEach(clearTimeout);
    setPhase(-1);
    setRunning(true);
    PHASE_DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => {
        setPhase(i);
        // auto-select the most recently activated node
        const key = (Object.keys(NODE_META) as NodeKey[]).find(
          k => NODE_META[k].phase === i
        );
        if (key) setSelected(key);
        if (i === PHASE_DELAYS.length - 1) {
          setTimeout(() => setRunning(false), 600);
        }
      }, delay + 300);
      timers.current.push(t);
    });
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setPhase(-1);
    setRunning(false);
    setSelected("query");
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const meta = NODE_META[selected];
  const Icon = meta.Icon;

  const totalMs = Object.values(NODE_META).reduce((s, m) => s + m.latency, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Flowing dash animation */}
      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 18; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes pulseRing {
          0%,100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 0.5;  transform: scale(1.02); }
        }
        @keyframes nodePop {
          0%   { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
      `}</style>

      {/* Fixed grid bg */}
      <div className="fixed inset-0 grid-bg opacity-40 pointer-events-none" />

      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-4 px-6 py-3.5 border-b border-border"
        style={{ background: "rgba(4,9,26,0.94)", backdropFilter: "blur(14px)" }}
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-muted-text hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground hidden sm:block">MedSearch AI</span>
        </button>

        <div className="w-px h-5 bg-border-dim mx-2 hidden sm:block" />
        <div className="hidden sm:block">
          <span className="text-sm font-bold text-foreground">Backend Pipeline</span>
          <span className="ml-2 text-xs text-muted-text">Live data flow visualization</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", color: "#38bdf8" }}
          >
            <Zap className="w-3 h-3" />
            End-to-end ≈ {(totalMs / 1000).toFixed(1)}s
          </div>

          {running ? (
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#1a3060", color: "#94a3b8", border: "1px solid #254880" }}
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          ) : (
            <button
              onClick={simulate}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ background: "#38bdf8", color: "#04091a" }}
            >
              <Play className="w-4 h-4" />
              {phase >= 0 ? "Replay" : "Run Pipeline"}
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 px-4 py-8 max-w-screen-xl mx-auto">
        {/* Page title */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8" }}
          >
            <Zap className="w-3 h-3" />
            PubMed → BM25 + Semantic (RRF) → NLI Classification → RAG Chat
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            From question to{" "}
            <span className="gradient-text">stance-aware evidence</span>
          </h1>
          <p className="text-sm text-muted-text max-w-xl mx-auto leading-relaxed">
            Hit <strong className="text-primary">Run Pipeline</strong> to watch your query travel through each backend stage. Click any node to inspect it.
          </p>
        </div>

        {/* Main layout: flowchart + detail panel */}
        <div className="flex flex-col xl:flex-row gap-6 items-start justify-center">

          {/* ── Flowchart SVG ─────────────────────────────────────────────── */}
          <div
            className="w-full xl:flex-1 rounded-2xl border overflow-hidden"
            style={{
              background: "rgba(4,9,26,0.7)",
              borderColor: "#1a3060",
              backdropFilter: "blur(8px)",
              maxWidth: 660,
              margin: "0 auto",
            }}
          >
            {/* Query label bar */}
            <div
              className="flex items-center gap-3 px-5 py-3 border-b"
              style={{ borderColor: "#1a3060", background: "#070e22" }}
            >
              <Search className="w-4 h-4 text-muted-text shrink-0" />
              <span
                className="text-sm font-mono font-medium transition-colors duration-500"
                style={{ color: phase >= 0 ? "#38bdf8" : "#475569" }}
              >
                "statins and cognitive decline"
              </span>
              {running && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-primary font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Processing…
                </span>
              )}
              {!running && phase >= 5 && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-support font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-support" />
                  Complete
                </span>
              )}
            </div>

            {/* SVG flowchart — viewBox scales to container */}
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${VW} ${VH}`}
                style={{ width: "100%", height: "auto", display: "block", minWidth: 340 }}
              >
                {/* ── Connections ── */}
                {CONNS.map(conn => (
                  <Connection
                    key={conn.id}
                    from={conn.from}
                    to={conn.to}
                    color={conn.color}
                    active={isConnActive(conn)}
                  />
                ))}

                {/* ── Nodes ── */}
                {(Object.keys(POS) as NodeKey[]).map(key => (
                  <NodeBox
                    key={key}
                    nodeKey={key}
                    active={isNodeActive(key)}
                    selected={selected === key}
                    onClick={() => setSelected(key)}
                  />
                ))}

                {/* ── "BM25 + Semantic" parallel label ── */}
                {phase >= 1 && (
                  <text
                    x={VW / 2} y={382}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="600"
                    fill="#94a3b8"
                    opacity={0.7}
                    letterSpacing="0.14em"
                  >
                    PARALLEL RETRIEVAL
                  </text>
                )}

                {/* ── Final output row — shown after LLM Chat (phase 5) ── */}
                {phase >= 5 && (
                  <g>
                    {/* Label */}
                    <text x={480} y={1092} textAnchor="middle" fontSize={10} fontWeight="600"
                      fill="#94a3b8" opacity={0.8} letterSpacing="0.12em">CITED IN CHAT</text>

                    {/* Support box */}
                    <rect x={294} y={1104} width={116} height={50} rx={10}
                      fill="rgba(52,211,153,0.1)" stroke="rgba(52,211,153,0.35)" strokeWidth={1.5} />
                    <text x={352} y={1123} textAnchor="middle" fontSize={10} fontWeight="700" fill="#34d399">✓ SUPPORTING</text>
                    <text x={352} y={1143} textAnchor="middle" fontSize={16} fontWeight="800" fill="#34d399">3</text>

                    {/* Neutral box */}
                    <rect x={422} y={1104} width={116} height={50} rx={10}
                      fill="rgba(167,139,250,0.1)" stroke="rgba(167,139,250,0.35)" strokeWidth={1.5} />
                    <text x={480} y={1123} textAnchor="middle" fontSize={10} fontWeight="700" fill="#a78bfa">— NEUTRAL</text>
                    <text x={480} y={1143} textAnchor="middle" fontSize={16} fontWeight="800" fill="#a78bfa">3</text>

                    {/* Oppose box */}
                    <rect x={550} y={1104} width={116} height={50} rx={10}
                      fill="rgba(251,113,133,0.1)" stroke="rgba(251,113,133,0.35)" strokeWidth={1.5} />
                    <text x={608} y={1123} textAnchor="middle" fontSize={10} fontWeight="700" fill="#fb7185">✗ OPPOSING</text>
                    <text x={608} y={1143} textAnchor="middle" fontSize={16} fontWeight="800" fill="#fb7185">2</text>
                  </g>
                )}
              </svg>
            </div>
          </div>

          {/* ── Detail panel ──────────────────────────────────────────────── */}
          <div className="w-full xl:w-[340px] xl:sticky xl:top-24 xl:self-start flex flex-col gap-4">

            {/* Selected node card */}
            <div
              className="rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-300"
              style={{
                borderColor: meta.color + "55",
                background: `linear-gradient(135deg, ${meta.color}0a 0%, rgba(4,9,26,0.95) 60%)`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: meta.color + "18", border: `1.5px solid ${meta.color}44` }}
                >
                  <Icon className="w-6 h-6" style={{ color: meta.color }} />
                </div>
                <div>
                  <div className="font-bold text-base" style={{ color: meta.color }}>{meta.label}</div>
                  <div className="text-xs text-muted-text">{meta.sublabel}</div>
                </div>
              </div>

              <p className="text-sm leading-7 text-foreground/75">{meta.description}</p>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-text mb-2">Technologies</div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.tech.map(t => (
                    <span
                      key={t}
                      className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold"
                      style={{ background: meta.color + "15", border: `1px solid ${meta.color}35`, color: meta.color }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className="rounded-xl p-3 flex items-start gap-2.5"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid #1a3060" }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-text shrink-0 mt-0.5">Output</span>
                <span className="text-sm text-foreground font-medium leading-snug">{meta.output}</span>
              </div>

              {meta.latency > 0 && (
                <div>
                  <div className="flex justify-between text-[10px] text-muted-text mb-1.5">
                    <span className="font-bold uppercase tracking-widest">Latency</span>
                    <span className="font-mono font-bold" style={{ color: meta.color }}>~{meta.latency}ms</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0c1630" }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min((meta.latency / 2000) * 100, 100)}%`,
                        background: `linear-gradient(90deg, ${meta.color}, ${meta.color}66)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Architecture stack */}
            <div
              className="rounded-2xl border p-4"
              style={{ background: "#070e22", borderColor: "#1a3060" }}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-text mb-3">Full pipeline stack</div>
              <div className="flex flex-col gap-2">
                {(Object.keys(NODE_META) as NodeKey[]).map((key, i) => {
                  const m = NODE_META[key];
                  const active = phase >= m.phase;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(key)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all"
                      style={{
                        background: selected === key ? m.color + "12" : "transparent",
                        border: `1px solid ${selected === key ? m.color + "40" : "transparent"}`,
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-500"
                        style={{
                          background: active ? m.color : "#1a3060",
                          color: active ? "#04091a" : "#475569",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="text-xs font-semibold transition-colors duration-400"
                        style={{ color: active ? m.color : "#475569" }}
                      >
                        {m.label}
                      </span>
                      {active && m.latency > 0 && (
                        <span className="ml-auto text-[10px] font-mono" style={{ color: m.color }}>
                          {m.latency}ms
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results preview when done */}
            {phase >= 5 && (
              <div
                className="rounded-2xl border p-4"
                style={{ background: "rgba(52,211,153,0.05)", borderColor: "rgba(52,211,153,0.3)" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-support mb-3">Pipeline complete</div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { Icon: CheckCircle2, label: "Support", count: 3, color: "#34d399" },
                    { Icon: MinusCircle, label: "Neutral", count: 3, color: "#a78bfa" },
                    { Icon: XCircle, label: "Oppose", count: 3, color: "#fb7185" },
                  ].map(({ Icon: I, label, count, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1 py-2 rounded-xl" style={{ background: color + "10", border: `1px solid ${color}25` }}>
                      <I className="w-4 h-4" style={{ color }} />
                      <span className="text-base font-bold" style={{ color }}>{count}</span>
                      <span className="text-[9px] text-muted-text">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-support font-medium">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Evidence chat ready
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
