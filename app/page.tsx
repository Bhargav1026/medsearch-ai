"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IntroSplash } from "./_components/IntroSplash";
import {
  Search,
  FlaskConical,
  Layers,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Zap,
  BookOpen,
  Brain,
} from "lucide-react";

const EXAMPLE_QUERIES = [
  "statins and cognitive decline",
  "SSRIs for depression in adolescents",
  "aspirin for cancer prevention",
  "metformin and longevity aging",
  "omega-3 cardiovascular outcomes",
  "vitamin D supplementation outcomes",
];

const FEATURES = [
  {
    icon: Layers,
    label: "Hybrid Retrieval",
    desc: "BM25 lexical ranking combined with sentence-transformer semantic embeddings for maximum recall.",
    color: "text-primary",
    bg: "bg-surface-2 border-border",
  },
  {
    icon: Brain,
    label: "Stance Classification",
    desc: "Medical NLI model assigns each abstract a Support, Oppose, or Neutral label relative to your query.",
    color: "text-support",
    bg: "bg-support-bg border-support-border",
  },
  {
    icon: MessageSquare,
    label: "Evidence-Grounded Chat",
    desc: "Follow-up questions answered from retrieved abstracts — every claim linked to a PMID source.",
    color: "text-neut",
    bg: "bg-neut-bg border-neut-border",
  },
  {
    icon: BookOpen,
    label: "PubMed Coverage",
    desc: "Abstracts pulled directly via NCBI E-utilities API, including PMID, authors, journal, and MeSH terms.",
    color: "text-primary-dim",
    bg: "bg-surface-2 border-border",
  },
];

function ScientistCharacter() {
  return (
    <div className="relative select-none pointer-events-none" style={{ width: 108, height: 215 }}>
      <style>{`
        @keyframes sciFloat {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-7px); }
        }
        @keyframes sciWave {
          0%,100% { transform: rotate(-20deg); }
          50%      { transform: rotate(24deg); }
        }
        @keyframes sciBubble {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.9; transform:scale(1.04); }
        }
        .sf  { animation: sciFloat 3.2s ease-in-out infinite; }
        .sw  { transform-origin: 100px 122px; animation: sciWave 1.1s ease-in-out infinite; }
        .sb  { animation: sciBubble 2.6s ease-in-out infinite; }
      `}</style>

      <div className="sf">
        {/* Rendered smaller: 108×215 from viewBox 132×262 (82% scale) */}
        <svg viewBox="0 0 132 262" width="108" height="215" xmlns="http://www.w3.org/2000/svg">

          {/* ── SPEECH BUBBLE ── */}
          <g className="sb">
            <rect x="1" y="1" width="112" height="36" rx="10"
              fill="rgba(56,189,248,0.13)" stroke="rgba(56,189,248,0.6)" strokeWidth="1.3"/>
            <text x="57" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="#38bdf8">Great choice!</text>
            <text x="57" y="28" textAnchor="middle" fontSize="9" fill="#94a3b8">Searching… 🔬</text>
            <polygon points="28,37 20,51 40,37"
              fill="rgba(56,189,248,0.13)" stroke="rgba(56,189,248,0.6)" strokeWidth="1.3"/>
          </g>

          {/* ══ WILD SILVER HAIR — energetic, Einstein-style ══ */}
          <ellipse cx="59" cy="70" rx="33" ry="22" fill="#e8e8f0"/>
          <path d="M27 66 Q20 48 31 41" stroke="#d8d8ee" strokeWidth="11" fill="none" strokeLinecap="round"/>
          <path d="M37 57 Q30 39 41 32" stroke="#e0e0f0" strokeWidth="10" fill="none" strokeLinecap="round"/>
          <path d="M51 52 Q47 34 57 28" stroke="#e8e8f8" strokeWidth="10" fill="none" strokeLinecap="round"/>
          <path d="M65 51 Q63 33 73 28" stroke="#dcdcf0" strokeWidth="10" fill="none" strokeLinecap="round"/>
          <path d="M78 56 Q86 40 91 46" stroke="#e4e4f4" strokeWidth="10" fill="none" strokeLinecap="round"/>
          <path d="M88 68 Q98 56 97 66" stroke="#e8e8f8" strokeWidth="9" fill="none" strokeLinecap="round"/>

          {/* ══ HEAD — round, youthful ══ */}
          <circle cx="59" cy="83" r="31" fill="#ffe0b8"/>

          {/* ══ GLASSES — hip round frames, blue tint ══ */}
          <circle cx="46" cy="81" r="12" fill="rgba(56,189,248,0.15)" stroke="#1a1a2e" strokeWidth="3.2"/>
          <circle cx="72" cy="81" r="12" fill="rgba(56,189,248,0.15)" stroke="#1a1a2e" strokeWidth="3.2"/>
          <line x1="58" y1="81" x2="60" y2="81" stroke="#1a1a2e" strokeWidth="2.5"/>
          <line x1="34" y1="77" x2="28" y2="74" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="84" y1="77" x2="90" y2="74" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Bright blue eyes through lenses */}
          <circle cx="46" cy="82" r="6.5" fill="#1e6fd4"/>
          <circle cx="72" cy="82" r="6.5" fill="#1e6fd4"/>
          <circle cx="48.5" cy="79.5" r="2.5" fill="white"/>
          <circle cx="74.5" cy="79.5" r="2.5" fill="white"/>

          {/* Eyebrows — lighter, thinner (younger) */}
          <path d="M36 67 Q46 63 56 66" stroke="#aaa" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M62 66 Q72 63 82 67" stroke="#aaa" strokeWidth="2.5" fill="none" strokeLinecap="round"/>

          {/* NOSE — small cute button */}
          <ellipse cx="59" cy="90" rx="4.5" ry="3.5" fill="#e8906a"/>

          {/* ROSY CHEEKS */}
          <ellipse cx="35" cy="91" rx="8" ry="5" fill="#ff7070" opacity="0.15"/>
          <ellipse cx="83" cy="91" rx="8" ry="5" fill="#ff7070" opacity="0.15"/>

          {/* BIG HAPPY SMILE — open, teeth showing (young & friendly) */}
          <path d="M46 97 Q59 111 72 97" stroke="#b04020" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M46 97 Q59 108 72 97" fill="white" stroke="none"/>
          <path d="M46 97 Q59 108 72 97" fill="none" stroke="#ddd" strokeWidth="1"/>

          {/* NECK */}
          <rect x="52" y="112" width="14" height="13" rx="5" fill="#ffe0b8"/>

          {/* SHIRT COLLAR — sky blue */}
          <path d="M48 119 Q59 114 70 119 L70 130 Q59 124 48 130 Z" fill="#7ec8f0"/>

          {/* TIE — bright blue, modern */}
          <path d="M56 119 L59 116 L62 119 L61 125 L59 127 L57 125 Z" fill="#1565c0"/>
          <path d="M57 125 L59 127 L61 125 L60 162 L59 166 L58 162 Z" fill="#1976d2"/>

          {/* ══ LAB COAT ══ */}
          <path d="M18 120 L102 120 L104 197 L16 197 Z" fill="white" stroke="#dde8f0" strokeWidth="1.2"/>
          <path d="M18 120 L57 115 L57 150 L18 136 Z" fill="#f0f5fd" stroke="#dde8f0" strokeWidth="1"/>
          <path d="M102 120 L61 115 L61 150 L102 136 Z" fill="#f0f5fd" stroke="#dde8f0" strokeWidth="1"/>
          {/* Pocket + pens */}
          <rect x="21" y="152" width="16" height="20" rx="3" fill="none" stroke="#c8d8ec" strokeWidth="1.2"/>
          <line x1="25" y1="152" x2="25" y2="168" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="30" y1="152" x2="30" y2="167" stroke="#fb7185" strokeWidth="2" strokeLinecap="round"/>
          <line x1="34" y1="152" x2="34" y2="167" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/>

          {/* ══ PANTS ══ */}
          <path d="M20 197 L58 197 L56 249 L16 249 Z" fill="#5a6a80"/>
          <path d="M100 197 L62 197 L64 249 L104 249 Z" fill="#5a6a80"/>
          <line x1="36" y1="197" x2="34" y2="248" stroke="#4a5a70" strokeWidth="1.2" opacity="0.5"/>
          <line x1="82" y1="197" x2="84" y2="248" stroke="#4a5a70" strokeWidth="1.2" opacity="0.5"/>

          {/* ══ BOOTS ══ */}
          <ellipse cx="34" cy="249" rx="21" ry="9" fill="#32323e"/>
          <ellipse cx="84" cy="249" rx="21" ry="9" fill="#32323e"/>
          <ellipse cx="28" cy="245" rx="7" ry="3" fill="#444452" opacity="0.5"/>
          <ellipse cx="78" cy="245" rx="7" ry="3" fill="#444452" opacity="0.5"/>

          {/* ══ LEFT ARM — THUMBS UP ══ */}
          <path d="M18 124 L8 129 Q1 135 1 152 L3 173 Q5 181 15 179 L23 177 L23 124 Z"
            fill="white" stroke="#dde8f0" strokeWidth="1.2"/>
          <rect x="2" y="174" width="20" height="16" rx="6" fill="#ffe0b8"/>
          <path d="M8 174 L5 162 Q5 151 11 149 Q17 147 20 156 L19 174 Z" fill="#ffe0b8"/>
          <path d="M6 161 Q11 151 18 154" stroke="#e09060" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M3 177 Q12 182 22 177" stroke="#e09060" strokeWidth="1" fill="none" strokeLinecap="round"/>

          {/* ══ RIGHT ARM — WAVE ══ */}
          <g className="sw">
            <path d="M100 122 L110 115 Q118 106 116 88 L112 72 Q110 63 100 65 L92 72 L92 122 Z"
              fill="white" stroke="#dde8f0" strokeWidth="1.2"/>
            <ellipse cx="108" cy="66" rx="13" ry="11" fill="#ffe0b8"/>
            <rect x="96"  y="45" width="9" height="24" rx="4.5" fill="#ffe0b8"/>
            <rect x="106" y="42" width="9" height="27" rx="4.5" fill="#ffe0b8"/>
            <rect x="116" y="45" width="9" height="24" rx="4.5" fill="#ffe0b8"/>
            <rect x="123" y="51" width="8" height="19" rx="4"   fill="#ffe0b8"/>
            <line x1="96"  y1="62" x2="105" y2="62" stroke="#e09060" strokeWidth="1" opacity="0.55"/>
            <line x1="106" y1="62" x2="115" y2="62" stroke="#e09060" strokeWidth="1" opacity="0.55"/>
            <line x1="116" y1="63" x2="125" y2="63" stroke="#e09060" strokeWidth="1" opacity="0.55"/>
          </g>

        </svg>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check sessionStorage after mount to avoid SSR/hydration mismatch
  useEffect(() => {
    const seen = sessionStorage.getItem("medsearch_intro_seen");
    if (!seen) setShowSplash(true);
    else setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  function handleSplashComplete() {
    sessionStorage.setItem("medsearch_intro_seen", "1");
    setShowSplash(false);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleExample(q: string) {
    setQuery(q);
    setTimeout(() => router.push(`/search?q=${encodeURIComponent(q)}`), 80);
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-background">
      {/* Intro splash — shows once per session */}
      {showSplash && <IntroSplash onComplete={handleSplashComplete} />}

      {/* Background grid */}
      <div className="absolute inset-0 grid-bg opacity-60 pointer-events-none" />

      {/* Decorative glows */}
      <div
        className="hero-glow w-[700px] h-[500px] top-[-150px] left-1/2 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(56,189,248,0.13) 0%, transparent 70%)" }}
      />
      <div
        className="hero-glow w-[400px] h-[400px] bottom-[100px] right-[-80px]"
        style={{ background: "radial-gradient(ellipse, rgba(167,139,250,0.1) 0%, transparent 70%)" }}
      />
      <div
        className="hero-glow w-[400px] h-[400px] bottom-[200px] left-[-80px]"
        style={{ background: "radial-gradient(ellipse, rgba(52,211,153,0.08) 0%, transparent 70%)" }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-border-dim"
        style={{ background: "rgba(4,9,26,0.92)", backdropFilter: "blur(14px)" }}
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground tracking-tight">MedSearch AI</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-text">
          <button
            onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            className="hover:text-foreground transition-colors"
          >
            How it works
          </button>
          <a href="/workflow" className="flex items-center gap-1.5 hover:text-primary transition-colors font-medium" style={{ color: "#38bdf8" }}>
            <Zap className="w-3.5 h-3.5" />
            Pipeline
          </a>
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            PubMed
          </a>
          <a
            href="https://github.com/Bhargava1026"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium hover:border-primary hover:text-primary transition-colors"
          >
            GitHub
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-6 py-20">
        {/* Badge */}
        <div
          className="animate-slide-up mb-6 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
          style={{
            borderColor: "rgba(56,189,248,0.3)",
            background: "rgba(56,189,248,0.08)",
            color: "#38bdf8",
          }}
        >
          <Zap className="w-3 h-3" />
          Hybrid BM25 + Semantic · Medical NLI · Evidence-Grounded RAG
        </div>

        {/* Headline */}
        <h1
          className="animate-slide-up text-4xl sm:text-5xl md:text-6xl font-bold text-center leading-tight tracking-tight mb-4 max-w-3xl"
          style={{ animationDelay: "0.05s" }}
        >
          Search medical literature{" "}
          <span className="gradient-text">with stance awareness</span>
        </h1>

        <p
          className="animate-slide-up text-lg text-muted-text text-center max-w-xl mb-10 leading-relaxed"
          style={{ animationDelay: "0.1s" }}
        >
          Instead of a ranked list, see which studies{" "}
          <span className="text-support font-medium">support</span>,{" "}
          <span className="text-oppose font-medium">oppose</span>, or stay{" "}
          <span className="text-neut font-medium">neutral</span> toward your query — then ask follow-up questions grounded in the retrieved evidence.
        </p>

        {/* Search bar + scientist side by side */}
        <div
          className="animate-slide-up w-full max-w-2xl mb-6 flex items-end gap-3"
          style={{ animationDelay: "0.15s" }}
        >
        <form onSubmit={handleSubmit} className="flex-1">
          <div
            className="relative flex items-center rounded-2xl border transition-all duration-300"
            style={{
              borderColor: focused ? "rgba(56,189,248,0.5)" : "#1a3060",
              background: "#070e22",
              boxShadow: focused ? "0 0 0 1px rgba(56,189,248,0.3), 0 0 40px rgba(56,189,248,0.1)" : "none",
            }}
          >
            <Search className="absolute left-4 w-5 h-5 text-muted-text shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="e.g. statins and cognitive decline..."
              className="flex-1 bg-transparent pl-12 pr-4 py-4 text-foreground placeholder:text-muted-text text-base outline-none"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="m-2 flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#38bdf8", color: "#04091a" }}
            >
              Search
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Scientist beside search bar */}
        <div className="shrink-0 hidden sm:block">
          <ScientistCharacter />
        </div>
        </div>

        {/* Example queries */}
        <div
          className="animate-slide-up flex flex-wrap items-center justify-center gap-2 mb-16 max-w-2xl"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="text-xs text-muted-text mr-1">Try:</span>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleExample(q)}
              className="px-3 py-1 rounded-full border border-border-dim text-xs text-muted-text hover:border-primary hover:text-primary transition-all"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Stance legend */}
        <div
          className="animate-slide-up flex items-center gap-6 mb-20 text-sm"
          style={{ animationDelay: "0.25s" }}
        >
          {[
            { icon: CheckCircle2, label: "Supporting", color: "text-support" },
            { icon: XCircle, label: "Opposing", color: "text-oppose" },
            { icon: MinusCircle, label: "Neutral", color: "text-neut" },
          ].map(({ icon: Icon, label, color }, i) => (
            <span key={label} className="flex items-center gap-6">
              {i > 0 && <span className="w-px h-4 bg-border-dim inline-block" />}
              <span className={`flex items-center gap-2 ${color}`}>
                <Icon className="w-4 h-4" />
                <span className="font-medium">{label}</span>
              </span>
            </span>
          ))}
        </div>

        {/* How it works */}
        <section id="how-it-works" className="w-full max-w-5xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-3"
              style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", color: "#38bdf8" }}>
              How it works
            </div>
            <h2 className="text-2xl font-bold text-foreground">From question to evidence in seconds</h2>
          </div>

          {/* Steps timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-8 left-[12.5%] right-[12.5%] h-px" style={{ background: "linear-gradient(90deg, transparent, #1a3060 20%, #1a3060 80%, transparent)" }} />

            {FEATURES.map(({ icon: Icon, label, desc, color, bg }, idx) => (
              <div key={label} className="relative flex flex-col items-center text-center px-4 pb-6 group">
                {/* Step number bubble */}
                <div
                  className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(4,9,26,0.9))",
                    border: "1px solid rgba(56,189,248,0.25)",
                    boxShadow: "0 0 20px rgba(56,189,248,0.08)",
                  }}
                >
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: "#38bdf8", color: "#04091a" }}>
                    {idx + 1}
                  </span>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="font-bold text-sm text-foreground mb-2">{label}</h3>
                <p className="text-xs text-muted-text leading-relaxed max-w-[180px]">{desc}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-xs text-muted-text">See the full backend flow with live animation</p>
            <a
              href="/workflow"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8" }}
            >
              <Zap className="w-4 h-4" />
              View Live Pipeline →
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-dim px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-text">
        <span>Bhargava Sai Vardhan Gunapu &amp; Karthik Nalluri</span>
        <span>Powered by PubMed · BM25 · Medical NLI · RAG</span>
      </footer>
    </div>
  );
}
