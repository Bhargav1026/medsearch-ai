"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

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

const STANCE_CONFIG = {
  support: {
    icon: CheckCircle2,
    label: "Supporting",
    textColor: "text-support",
    bgColor: "bg-support-bg",
    borderColor: "border-support-border",
    glowColor: "rgba(52, 211, 153, 0.15)",
    pillBg: "rgba(52, 211, 153, 0.12)",
    pillBorder: "rgba(52, 211, 153, 0.3)",
  },
  oppose: {
    icon: XCircle,
    label: "Opposing",
    textColor: "text-oppose",
    bgColor: "bg-oppose-bg",
    borderColor: "border-oppose-border",
    glowColor: "rgba(251, 113, 133, 0.15)",
    pillBg: "rgba(251, 113, 133, 0.12)",
    pillBorder: "rgba(251, 113, 133, 0.3)",
  },
  neutral: {
    icon: MinusCircle,
    label: "Neutral",
    textColor: "text-neut",
    bgColor: "bg-neut-bg",
    borderColor: "border-neut-border",
    glowColor: "rgba(167, 139, 250, 0.15)",
    pillBg: "rgba(167, 139, 250, 0.12)",
    pillBorder: "rgba(167, 139, 250, 0.3)",
  },
};

interface Props {
  abstract: Abstract;
  index: number;
}

export function AbstractCard({ abstract, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STANCE_CONFIG[abstract.stance];
  const Icon = cfg.icon;

  const firstAuthor = abstract.authors[0] ?? "";
  const etAl = abstract.authors.length > 1 ? " et al." : "";
  const authorStr = firstAuthor + etAl;

  const confidencePct = Math.round(abstract.confidence * 100);

  return (
    <div
      className={`abstract-card rounded-xl border ${cfg.borderColor} ${cfg.bgColor} p-4 flex flex-col gap-3`}
      style={{
        animationDelay: `${index * 0.08}s`,
        boxShadow: `0 0 0 0 ${cfg.glowColor}`,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 24px ${cfg.glowColor}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${cfg.glowColor}`;
      }}
    >
      {/* Top row: stance pill + confidence */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`stance-pill ${cfg.textColor}`}
          style={{ background: cfg.pillBg, border: `1px solid ${cfg.pillBorder}` }}
        >
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
        <div className="flex items-center gap-2">
          {/* Confidence bar */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={`h-full rounded-full ${cfg.textColor}`}
                style={{
                  width: `${confidencePct}%`,
                  background: abstract.stance === "support" ? "#34d399" : abstract.stance === "oppose" ? "#fb7185" : "#a78bfa",
                }}
              />
            </div>
            <span className="text-[10px] text-muted-text font-mono">{confidencePct}%</span>
          </div>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${abstract.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-mono text-muted-text hover:text-primary transition-colors px-1.5 py-0.5 rounded border border-border-dim hover:border-primary"
            title="Open in PubMed"
          >
            {abstract.pmid}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-3">
        {abstract.title}
      </h3>

      {/* Meta */}
      <div className="flex items-center gap-1.5 text-xs text-muted-text flex-wrap">
        <span className="font-medium text-foreground/70">{abstract.journal}</span>
        <span>·</span>
        <span>{abstract.year}</span>
        {authorStr && (
          <>
            <span>·</span>
            <span>{authorStr}</span>
          </>
        )}
      </div>

      {/* Excerpt */}
      <p className={`text-xs text-muted-text leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
        {abstract.excerpt}
      </p>

      {/* MeSH terms */}
      {expanded && abstract.meshTerms.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {abstract.meshTerms.map((term) => (
            <span
              key={term}
              className="px-2 py-0.5 rounded text-[10px] border border-border-dim text-muted-text"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              {term}
            </span>
          ))}
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-text hover:text-foreground transition-colors self-start"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-3 h-3" /> Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" /> Show more
          </>
        )}
      </button>
    </div>
  );
}
