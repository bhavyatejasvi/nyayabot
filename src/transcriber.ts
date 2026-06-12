import axios from "axios";
import { config } from "./config";

/**
 * Downloads audio from Twilio and transcribes it.
 *
 * Strategy (in order):
 *   1. Groq Whisper  — if GROQ_API_KEY is set (free at console.groq.com)
 *   2. HuggingFace   — if HF_API_KEY is set    (free at huggingface.co)
 *   3. Graceful skip — returns null so the caller can prompt the user to type
 */
export async function transcribeAudio(
  mediaUrl: string
): Promise<{ text: string; language: string } | null> {
  // Download audio from Twilio
  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: {
      username: config.twilio.accountSid,
      password: config.twilio.authToken,
    },
    timeout: 15000,
  });

  const audioBuffer = Buffer.from(response.data);

  // ── Option 1: Groq (free — console.groq.com) ──────────────────────────────
  if (config.groq.apiKey) {
    try {
      const Groq = (await import("groq-sdk")).default;
      const groq = new Groq({ apiKey: config.groq.apiKey });

      const transcription = await (groq.audio.transcriptions.create as Function)({
        file: new File([audioBuffer], "audio.ogg", { type: "audio/ogg" }),
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json",
      });

      return {
        text:     (transcription as any).text     || "",
        language: (transcription as any).language || "hi",
      };
    } catch (err) {
      console.error("Groq transcription failed, trying next provider:", err);
    }
  }

  // ── Option 2: HuggingFace Inference API (free — huggingface.co) ───────────
  if (process.env.HF_API_KEY) {
    try {
      const hfRes = await axios.post(
        "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
        audioBuffer,
        {
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            "Content-Type": "audio/ogg",
          },
          timeout: 30000,
        }
      );
      const text = hfRes.data?.text || "";
      return { text, language: "hi" }; // HF free API doesn't return language
    } catch (err) {
      console.error("HuggingFace transcription failed:", err);
    }
  }

  // ── No transcription provider configured ──────────────────────────────────
  return null;
}
