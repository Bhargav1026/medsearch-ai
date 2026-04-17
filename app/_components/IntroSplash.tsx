"use client";

import { useEffect, useState, useRef } from "react";

const HELIX_RUNGS = 16;
const HELIX_RADIUS = 32;
const HELIX_HEIGHT = HELIX_RUNGS * 22;

interface HelixDot {
  x1: number; y: number; z1: number;
  x2: number; z2: number;
}

function computeHelix(angle: number): HelixDot[] {
  return Array.from({ length: HELIX_RUNGS }, (_, i) => {
    const phase = (2 * Math.PI * i) / HELIX_RUNGS;
    const y = (i / (HELIX_RUNGS - 1)) * HELIX_HEIGHT;
    const x1 = HELIX_RADIUS * Math.sin(angle + phase);
    const z1 = HELIX_RADIUS * Math.cos(angle + phase);
    const x2 = HELIX_RADIUS * Math.sin(angle + phase + Math.PI);
    const z2 = HELIX_RADIUS * Math.cos(angle + phase + Math.PI);
    return { x1, y, z1, x2, z2 };
  });
}

const TITLE = "MEDSEARCH AI";
const STATUS_MESSAGES = [
  "Initializing evidence engine…",
  "Loading PubMed index…",
  "Calibrating NLI classifier…",
  "Ready.",
];

export function IntroSplash({ onComplete }: { onComplete: () => void }) {
  const [angle, setAngle] = useState(0);
  const [helix, setHelix] = useState<HelixDot[]>(computeHelix(0));
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [letterCount, setLetterCount] = useState(0);
  const [exiting, setExiting] = useState(false);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(Date.now());
  const TOTAL_DURATION = 3200;

  // Animate helix rotation
  useEffect(() => {
    const animate = () => {
      const elapsed = Date.now() - startRef.current;
      const a = elapsed * 0.0025;
      setAngle(a);
      setHelix(computeHelix(a));

      const p = Math.min(elapsed / TOTAL_DURATION, 1);
      setProgress(p);

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Letter reveal
  useEffect(() => {
    if (letterCount >= TITLE.length) return;
    const t = setTimeout(() => setLetterCount((c) => c + 1), 80);
    return () => clearTimeout(t);
  }, [letterCount]);

  // Status messages
  useEffect(() => {
    const intervals = STATUS_MESSAGES.map((_, i) =>
      setTimeout(() => setStatusIdx(i), 400 + i * 700)
    );
    return () => intervals.forEach(clearTimeout);
  }, []);

  // Exit sequence
  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), TOTAL_DURATION);
    const t2 = setTimeout(() => onComplete(), TOTAL_DURATION + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "#04091a",
        opacity: exiting ? 0 : 1,
        transition: "opacity 0.6s ease-in-out",
        pointerEvents: exiting ? "none" : undefined,
      }}
    >
      {/* Grid bg */}
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />

      {/* Radial glow behind helix */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(56,189,248,0.18) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      {/* DNA Helix */}
      <div
        style={{
          position: "relative",
          width: HELIX_RADIUS * 2 + 24,
          height: HELIX_HEIGHT,
          marginBottom: 40,
        }}
      >
        {helix.map((dot, i) => {
          const t = i / (HELIX_RUNGS - 1); // 0–1 along helix

          // Strand 1
          const size1 = Math.max(4, 9 + (dot.z1 / HELIX_RADIUS) * 5);
          const op1 = 0.35 + ((dot.z1 + HELIX_RADIUS) / (HELIX_RADIUS * 2)) * 0.65;
          const hue1 = 185 + t * 60; // teal → blue

          // Strand 2
          const size2 = Math.max(4, 9 + (dot.z2 / HELIX_RADIUS) * 5);
          const op2 = 0.35 + ((dot.z2 + HELIX_RADIUS) / (HELIX_RADIUS * 2)) * 0.65;
          const hue2 = 260 + t * 60; // purple → violet

          const cx = HELIX_RADIUS + 12; // center x

          return (
            <span key={i}>
              {/* Connector line */}
              <span
                style={{
                  position: "absolute",
                  left: cx + dot.x1,
                  top: dot.y + 4,
                  width: Math.abs(dot.x2 - dot.x1),
                  height: 1,
                  background: `linear-gradient(90deg, hsla(${hue1},70%,60%,0.3), hsla(${hue2},70%,65%,0.3))`,
                  transformOrigin: "left center",
                  transform: dot.x2 < dot.x1 ? "scaleX(-1)" : undefined,
                  pointerEvents: "none",
                }}
              />
              {/* Dot 1 */}
              <span
                style={{
                  position: "absolute",
                  left: cx + dot.x1 - size1 / 2,
                  top: dot.y - size1 / 2 + 8,
                  width: size1,
                  height: size1,
                  borderRadius: "50%",
                  background: `hsl(${hue1}, 80%, 62%)`,
                  boxShadow: `0 0 ${size1 + 4}px hsl(${hue1}, 80%, 62%)`,
                  opacity: op1,
                  pointerEvents: "none",
                }}
              />
              {/* Dot 2 */}
              <span
                style={{
                  position: "absolute",
                  left: cx + dot.x2 - size2 / 2,
                  top: dot.y - size2 / 2 + 8,
                  width: size2,
                  height: size2,
                  borderRadius: "50%",
                  background: `hsl(${hue2}, 75%, 68%)`,
                  boxShadow: `0 0 ${size2 + 4}px hsl(${hue2}, 75%, 68%)`,
                  opacity: op2,
                  pointerEvents: "none",
                }}
              />
            </span>
          );
        })}
      </div>

      {/* Title — letter by letter */}
      <div className="flex items-center justify-center gap-0 mb-3">
        {TITLE.split("").map((ch, i) => (
          <span
            key={i}
            style={{
              opacity: i < letterCount ? 1 : 0,
              transform: i < letterCount ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.25s ease, transform 0.25s ease",
              fontSize: "2rem",
              fontWeight: 800,
              letterSpacing: "0.12em",
              background:
                i < 3
                  ? "linear-gradient(135deg, #38bdf8, #818cf8)"
                  : i < 9
                  ? "linear-gradient(135deg, #e2e8f0, #94a3b8)"
                  : "linear-gradient(135deg, #a78bfa, #818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              display: "inline-block",
              minWidth: ch === " " ? "0.5em" : undefined,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Subtitle */}
      <p
        style={{
          color: "#475569",
          fontSize: "0.75rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginBottom: 32,
          opacity: letterCount >= TITLE.length ? 1 : 0,
          transition: "opacity 0.5s ease 0.2s",
        }}
      >
        Stance-Aware · Evidence-Grounded · Medical Search
      </p>

      {/* Status message */}
      <p
        key={statusIdx}
        style={{
          color: "#38bdf8",
          fontSize: "0.7rem",
          fontFamily: "monospace",
          marginBottom: 16,
          opacity: 0.8,
          animation: "fade-in 0.3s ease forwards",
        }}
      >
        {STATUS_MESSAGES[statusIdx]}
      </p>

      {/* Progress bar */}
      <div
        style={{
          width: 200,
          height: 2,
          borderRadius: 9999,
          background: "#1a3060",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            borderRadius: 9999,
            background: "linear-gradient(90deg, #38bdf8, #818cf8, #a78bfa)",
            transition: "width 0.1s linear",
          }}
        />
      </div>

      {/* Corner decorations */}
      {[
        { top: 20, left: 20 },
        { top: 20, right: 20 },
        { bottom: 20, left: 20 },
        { bottom: 20, right: 20 },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderTop: i < 2 ? "1px solid rgba(56,189,248,0.3)" : undefined,
            borderBottom: i >= 2 ? "1px solid rgba(56,189,248,0.3)" : undefined,
            borderLeft: i % 2 === 0 ? "1px solid rgba(56,189,248,0.3)" : undefined,
            borderRight: i % 2 === 1 ? "1px solid rgba(56,189,248,0.3)" : undefined,
            ...pos,
          }}
        />
      ))}
    </div>
  );
}
