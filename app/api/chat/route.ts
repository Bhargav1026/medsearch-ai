import { NextRequest } from "next/server";

export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Abstract {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  excerpt: string;
  stance: "support" | "oppose" | "neutral";
  confidence: number;
}

interface ChatRequest {
  query: string;
  message: string;
  history: ChatMessage[];
  abstracts: Abstract[];
}

// ── Gemini via fetch (no SDK needed) ──────────────────────────────────────────

async function callGemini(messages: { role: string; parts: { text: string }[] }[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: messages }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${raw}`);

  const data = JSON.parse(raw);
  const text: string = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("") ?? "";

  if (!text) throw new Error("Gemini returned empty response");
  return text.trim();
}

// ── Build the evidence context ────────────────────────────────────────────────

function buildAbstractContext(abstracts: Abstract[], query: string): string {
  const sup = abstracts.filter(a => a.stance === "support").sort((a, b) => b.confidence - a.confidence);
  const opp = abstracts.filter(a => a.stance === "oppose").sort((a, b) => b.confidence - a.confidence);
  const neu = abstracts.filter(a => a.stance === "neutral").sort((a, b) => b.confidence - a.confidence);

  const fmt = (a: Abstract, rank: number) => {
    const authors = a.authors.length === 1 ? a.authors[0]
      : a.authors.length === 2 ? `${a.authors[0]} & ${a.authors[1]}`
      : `${a.authors[0]} et al.`;
    return [
      `[${rank}] PMID:${a.pmid} | Stance: ${a.stance.toUpperCase()} | Confidence: ${Math.round(a.confidence * 100)}%`,
      `    Title: "${a.title}"`,
      `    Authors: ${authors}`,
      `    Journal: ${a.journal} (${a.year})`,
      `    Abstract: ${a.excerpt}`,
    ].join("\n");
  };

  const sections: string[] = [];
  if (sup.length) {
    sections.push(`=== SUPPORTING EVIDENCE (${sup.length} papers) ===`);
    sup.forEach((a, i) => sections.push(fmt(a, i + 1)));
  }
  if (opp.length) {
    sections.push(`\n=== OPPOSING EVIDENCE (${opp.length} papers) ===`);
    opp.forEach((a, i) => sections.push(fmt(a, i + 1)));
  }
  if (neu.length) {
    sections.push(`\n=== MECHANISTIC/NEUTRAL EVIDENCE (${neu.length} papers) ===`);
    neu.forEach((a, i) => sections.push(fmt(a, i + 1)));
  }

  return `RESEARCH TOPIC: "${query}"\nTOTAL PAPERS: ${abstracts.length} (${sup.length} supporting, ${opp.length} opposing, ${neu.length} neutral)\n\n${sections.join("\n")}`;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(query: string, abstractContext: string): string {
  return `You are Dr. Evidence — a senior medical research analyst and expert in evidence-based medicine. You speak like a knowledgeable human physician colleague, not a chatbot. Your responses are direct, specific, and grounded exclusively in the provided research abstracts.

CORE BEHAVIOR RULES:
1. **Answer the EXACT question asked.** If someone asks for "one paper," give exactly ONE paper — not five, not a summary of everything. Match your response format to the question.
2. **Be direct and human.** Start with the answer, not preamble. Never say "Great question!" or "Certainly!" Just answer.
3. **Always cite PMIDs** as [PMID:XXXXXX] inline so they appear as clickable links.
4. **Use concrete numbers.** HR, OR, RR, p-values, sample sizes, confidence intervals — quote them directly from the abstracts.
5. **Be honest about uncertainty.** If studies conflict, say so clearly and explain why they might diverge.
6. **Speak like an expert to a colleague.** Not dumbed-down, not overly formal. Direct clinical language.

RESPONSE STYLE EXAMPLES:
- "give me one supporting paper" → Name exactly one paper: title, authors, journal, year, key finding, stats, PMID. Then optionally ask if they want the runner-up.
- "what are the risks?" → Lead with the risk signal, cite the paper, then give the counterpoint.
- "why do studies disagree?" → Explain the specific methodological, population, or outcome differences.
- "summarize everything" → Give a structured evidence table, not a wall of text.

FORMATTING:
- Use **bold** for key findings, paper titles, and important numbers
- Use *italics* for journal names
- Use [PMID:XXXXXX] for all citations (these become clickable links)
- Use numbered lists when comparing multiple papers
- Keep responses focused — don't pad with unnecessary explanation

THE EVIDENCE BASE YOU MUST USE:
${abstractContext}

CRITICAL: Only cite papers from the evidence base above. Do not hallucinate PMIDs, titles, or statistics. If the evidence doesn't contain what the user needs, say so plainly.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Partial<ChatRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ response: "Invalid request.", citedPmids: [] }, { status: 400 });
  }
  const { query = "", message = "", history = [], abstracts = [] } = body;

  if (!message.trim()) {
    return Response.json({ response: "Please ask a question.", citedPmids: [] }, { status: 400 });
  }

  if (!abstracts || abstracts.length === 0) {
    return Response.json({
      response: "Run a search first to pull the evidence — once I have the papers loaded, I can give you precise, grounded answers.",
      citedPmids: [],
    });
  }

  const abstractContext = buildAbstractContext(abstracts, query);
  const systemPrompt = buildSystemPrompt(query, abstractContext);

  // Build conversation for Gemini multi-turn format
  const conversationMessages: { role: string; parts: { text: string }[] }[] = [];

  // System as first user turn + model ack (Gemini doesn't have a system role)
  conversationMessages.push({
    role: "user",
    parts: [{ text: systemPrompt + "\n\nAcknowledge that you have read and understood the evidence base and your instructions." }],
  });
  conversationMessages.push({
    role: "model",
    parts: [{ text: `Understood. I have the evidence base for "${query}" loaded: ${abstracts.filter(a => a.stance === "support").length} supporting, ${abstracts.filter(a => a.stance === "oppose").length} opposing, and ${abstracts.filter(a => a.stance === "neutral").length} neutral papers. I'll answer your questions directly and specifically, citing PMIDs from the provided abstracts only. What do you want to know?` }],
  });

  // Add conversation history
  for (const msg of history.slice(-10)) {
    conversationMessages.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Add the new user message
  conversationMessages.push({
    role: "user",
    parts: [{ text: message }],
  });

  try {
    const responseText = await callGemini(conversationMessages);
    const citedPmids = (responseText.match(/PMID:(\d+)/g) ?? []).map(m => m.replace("PMID:", ""));
    return Response.json({ response: responseText, citedPmids });
  } catch {
    // Fallback: OpenAI
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) throw new Error("No OpenAI key");

      // Trim abstract context to avoid token limit (~6000 chars max)
      const trimmedSystemPrompt = systemPrompt.length > 6000
        ? systemPrompt.slice(0, 6000) + "\n\n[Context truncated for length]"
        : systemPrompt;

      const openaiMessages = [
        { role: "system", content: trimmedSystemPrompt },
        ...history.slice(-6).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: message },
      ];

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: openaiMessages,
          temperature: 0.4,
          max_tokens: 1200,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${data?.error?.message}`);
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("OpenAI returned empty content");

      const citedPmids = (text.match(/PMID:(\d+)/g) ?? []).map((m: string) => m.replace("PMID:", ""));
      return Response.json({ response: text, citedPmids });
    } catch {
      // Fallback 3: HuggingFace Mistral
      try {
        const hfKey = process.env.HF_API_KEY;
        if (!hfKey) throw new Error("No HF key");

        const hfPrompt = `<s>[INST] You are a medical research analyst. Answer concisely based only on these abstracts.

RESEARCH QUERY: "${query}"

EVIDENCE:
${abstracts.slice(0, 5).map(a => `PMID:${a.pmid} [${a.stance.toUpperCase()}] ${a.title}: ${a.excerpt.slice(0, 300)}`).join("\n\n")}

USER QUESTION: ${message}

Rules: cite papers as [PMID:XXXXXX], use concrete numbers, be direct and specific. [/INST]`;

        const hfRes = await fetch(
          "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.3",
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${hfKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: hfPrompt, parameters: { max_new_tokens: 600, temperature: 0.4, return_full_text: false } }),
            signal: AbortSignal.timeout(25000),
          }
        );

        if (!hfRes.ok) throw new Error(`HF error ${hfRes.status}`);
        const hfData = await hfRes.json();
        const hfText: string = Array.isArray(hfData) ? hfData[0]?.generated_text ?? "" : hfData?.generated_text ?? "";
        if (!hfText.trim()) throw new Error("HF returned empty");

        const citedPmids = (hfText.match(/PMID:(\d+)/g) ?? []).map((m: string) => m.replace("PMID:", ""));
        return Response.json({ response: hfText.trim(), citedPmids });
      } catch {
        // All APIs down — return a smart local evidence summary
        const sup = abstracts.filter(a => a.stance === "support");
        const opp = abstracts.filter(a => a.stance === "oppose");
        const neu = abstracts.filter(a => a.stance === "neutral");
        const localResponse = [
          `Based on the **${abstracts.length} retrieved papers** for "${query}":\n`,
          sup.length ? `**Supporting evidence (${sup.length} papers):**\n${sup.slice(0,3).map((a,i) => `${i+1}. "${a.title}" — ${a.journal} (${a.year}) [PMID:${a.pmid}]`).join("\n")}` : "",
          opp.length ? `\n**Opposing evidence (${opp.length} papers):**\n${opp.slice(0,2).map((a,i) => `${i+1}. "${a.title}" — ${a.journal} (${a.year}) [PMID:${a.pmid}]`).join("\n")}` : "",
          neu.length ? `\n**Neutral/Mechanistic (${neu.length} papers):**\n${neu.slice(0,2).map((a,i) => `${i+1}. "${a.title}" — ${a.journal} (${a.year}) [PMID:${a.pmid}]`).join("\n")}` : "",
          "\n\n*AI chat is temporarily unavailable. Click any PMID above to read the full paper on PubMed.*",
        ].filter(Boolean).join("\n");

        return Response.json({ response: localResponse, citedPmids: abstracts.map(a => a.pmid) });
      }
    }
  }
}
