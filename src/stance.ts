/** LLM stance judge. Haiku 4.5 by choice: the paid stance lane sells at $0.01 per URL, so the judge has to cost well under that. */
import Anthropic from "@anthropic-ai/sdk";
import type { Judge, Stance } from "./check";

export const JUDGE_MODEL = "claude-haiku-4-5";

const SYSTEM = `You judge whether a web page supports a claim. You are given the claim and an excerpt of the page text.
Answer with JSON only, no prose: {"stance":"supports"|"contradicts"|"unclear","confidence":0..1,"evidence":"<=200 chars quoted or closely paraphrased from the page"}.
"supports": the page states the claim or facts that entail it. "contradicts": the page states something incompatible with the claim. "unclear": the page does not address it, or the excerpt is insufficient.
Be strict: numbers, dates, names and attributions must match. Do not use outside knowledge.`;

export function makeJudge(apiKey: string): Judge {
  const client = new Anthropic({ apiKey });
  return async (claim, pageText): Promise<Stance> => {
    const res = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: "user", content: `CLAIM:\n${claim}\n\nPAGE EXCERPT:\n${pageText}` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseStance(text);
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
