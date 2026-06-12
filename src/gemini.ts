/**
 * AI backend — uses Groq (LLaMA 3.3 70B, 14400 req/day free)
 * via the OpenAI-compatible API.
 * Exported names kept identical so all modules work unchanged.
 */
import OpenAI from "openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// llama-3.3-70b-versatile: very capable, 32k context, 6000 TPM free
const CLASSIFIER_MODEL = "llama-3.3-70b-versatile";
const LEGAL_MODEL      = "llama-3.3-70b-versatile";

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");
    _client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }
  return _client;
}

// "Model" is just a config bundle — same shape modules expect
export interface GroqModelConfig {
  systemPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export function classifierModel(systemInstruction: string): GroqModelConfig {
  return {
    systemPrompt: systemInstruction,
    model: CLASSIFIER_MODEL,
    maxTokens: 256,
    temperature: 0.1,
  };
}

export function legalModel(systemInstruction: string): GroqModelConfig {
  return {
    systemPrompt: systemInstruction,
    model: LEGAL_MODEL,
    maxTokens: 4096,
    temperature: 0.3,
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Generate JSON using Groq.
 * Retries once on 503; fails fast on 429 so caller uses keyword/offline fallback.
 */
export async function generateJSON<T>(
  cfg: GroqModelConfig,
  userMessage: string
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(3000);

    try {
      const res = await client().chat.completions.create({
        model: cfg.model,
        messages: [
          { role: "system", content: cfg.systemPrompt },
          { role: "user",   content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
      });

      const text = (res.choices[0]?.message?.content || "").trim();

      // 1. Direct parse
      try { return JSON.parse(text) as T; } catch {}

      // 2. Strip markdown fences
      const fenced = text.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
      try { return JSON.parse(fenced) as T; } catch {}

      // 3. Extract first { … } block
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]) as T; } catch {}
      }

      throw new Error(`Non-JSON response: ${text.slice(0, 120)}`);

    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err));
      const is429 = msg.includes("429") || (err as { status?: number }).status === 429;
      if (is429) throw err; // quota exhausted — let caller fall back
      if (attempt === 1) throw err; // last attempt
      // otherwise retry once
    }
  }
  throw new Error("generateJSON: exhausted retries");
}
