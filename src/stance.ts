/**
 * LLM stance judge over OpenRouter (OpenAI-compatible chat completions).
 * Model is a cheap one by design: the stance lane sells at $0.01 per URL, so the judge must cost well under that.
 */
import type { Judge, Stance } from "./check";

export const JUDGE_MODEL = "anthropic/claude-haiku-4.5";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM = `You judge whether a web page supports a claim. You are given the claim and an excerpt of the page text.
Answer with JSON only, no prose: {"stance":"supports"|"contradicts"|"unclear","confidence":0..1,"evidence":"<=200 chars quoted or closely paraphrased from the page"}.
"supports": the page states the claim or facts that entail it. "contradicts": the page states something incompatible with the claim. "unclear": the page does not address it, or the excerpt is insufficient.
Be strict: numbers, dates, names and attributions must match. Do not use outside knowledge.`;

export type JudgeOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
};

export function makeJudge(opts: JudgeOptions): Judge {
  const f = opts.fetch ?? fetch;
  const model = opts.model ?? JUDGE_MODEL;
  return async (claim, pageText): Promise<Stance> => {
    const res = await f(OPENROUTER_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        "http-referer": "https://citecheck.dev",
        "x-title": "citecheck",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `CLAIM:\n${claim}\n\nPAGE EXCERPT:\n${pageText}` },
        ],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`openrouter ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseStance(data.choices?.[0]?.message?.content ?? "");
  };
}

export function parseStance(text: string): Stance {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { stance: "unclear", confidence: 0, evidence: "judge returned no JSON" };
  try {
    const j = JSON.parse(m[0]) as Partial<Stance>;
    const stance = j.stance === "supports" || j.stance === "contradicts" ? j.stance : "unclear";
    const confidence = typeof j.confidence === "number" ? Math.min(1, Math.max(0, j.confidence)) : 0;
    return { stance, confidence, evidence: String(j.evidence ?? "").slice(0, 300) };
  } catch {
    return { stance: "unclear", confidence: 0, evidence: "judge returned invalid JSON" };
  }
}
