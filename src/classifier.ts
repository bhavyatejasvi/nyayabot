import { classifierModel, generateJSON } from "./gemini";
import { IntentCategory } from "./types";
import { CLASSIFIER_SYSTEM_PROMPT } from "./prompts/classifier";

interface ClassificationResult {
  intent: IntentCategory;
  language: string;
  summary_en: string;
}

const model = classifierModel(CLASSIFIER_SYSTEM_PROMPT);

// ── Keyword fallback — used when Gemini is unavailable ───────────────────────
// Note: no trailing \b so "assaulted", "arrested", "terminated" etc. all match.
const KEYWORD_MAP: Array<{ patterns: RegExp; intent: IntentCategory }> = [
  {
    // Tenancy FIRST — "landlord threatening" is a tenancy issue, not FIR
    patterns: /\b(rent|tenant|landlord|evict|makan|kiraya|lease|licens|rera|builder|flat|property|housing|ghar|makaan|deposit|brokerage|vacate|pg.owner|pgowner|accommodation|notice.period)/i,
    intent: "TENANCY_HOUSING",
  },
  {
    // Labour / wages / job — before FIR so "fired" doesn't match fir\b
    patterns: /\b(salary|salari|wage|wages|pay\b|pf\b|epf|esic|fired|sacked|terminat|retrench|gratuity|labour|labor|employer|boss|factory|contractor|naukri|job\b|provident|mazdoor|kaam|kaarkhana|overtime|layoff|resign|dismiss|workmen|industrial.dispute)/i,
    intent: "LABOUR_WAGE",
  },
  {
    // Consumer / fraud / UPI — before FIR so "consumer complaint" routes here
    patterns: /\b(upi|gpay|paytm|phonepe|fraud|scam|refund|consumer|product|defect|ecommerce|flipkart|amazon|meesho|cheated|deceiv|mislead|overcharg|billing|not.deliver|money.lost|hacked|otp)/i,
    intent: "CONSUMER_COURT",
  },
  {
    // Government welfare schemes
    patterns: /\b(scheme|yojana|pm.kisan|pmkisan|ration|ayushman|pmay|awas|ujjwala|mudra|mgnrega|scholarship|subsid|benefi|csc|seva.kendra|jandhan|bpl|apl|welfare|sarkari|government.help|pension|anganwadi|nhm|icds)/i,
    intent: "WELFARE_SCHEME",
  },
  {
    // RTI / civil rights — before FIR so specific civil complaints route here
    patterns: /\b(rti|right.to.information|discriminat|caste|dalit|sc.st|atrocit|nhrc|ncw|election|voter|aadhaar|uid|civil.right|human.right|ncsc|ncbc|untouchab|bonded.labour|child.labour)/i,
    intent: "CIVIL_RTI",
  },
  {
    // Police / FIR / crime — last among specifics; complaint/stolen/bank here as catch-all
    patterns: /(\bfir\b|police|thana|complaint|arrest|custod|hawalaat|constable|assault|attack|\bbeaten|\bbeat\b|hit me|harass|extort|bribe|rape|murder|theft|\brob|kidnap|threaten|crpc|encounter|molestat|stalk|domestic.violence|manhandl|lathi|mob|riot|stolen|bank.fraud)/i,
    intent: "FIR_POLICE",
  },
];

function detectLanguage(text: string): string {
  // Simple heuristic: if text has Devanagari characters → Hindi
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[ঀ-৿]/.test(text)) return "bn";
  if (/[஀-௿]/.test(text)) return "ta";
  if (/[ఀ-౿]/.test(text)) return "te";
  if (/[઀-૿]/.test(text)) return "gu";
  return "en";
}

function keywordClassify(text: string): ClassificationResult | null {
  const lower = text.toLowerCase();
  for (const { patterns, intent } of KEYWORD_MAP) {
    if (patterns.test(lower)) {
      return { intent, language: detectLanguage(text), summary_en: text.slice(0, 100) };
    }
  }
  return null;
}

// ── Main classifier ──────────────────────────────────────────────────────────
export async function classifyIntent(
  userMessage: string,
  detectedLanguage?: string
): Promise<ClassificationResult> {
  try {
    const parsed = await generateJSON<ClassificationResult>(model, userMessage);
    // Prefer Whisper-detected language over classifier when classifier says "en"
    if (detectedLanguage && parsed.language === "en") {
      parsed.language = detectedLanguage;
    }
    // If Gemini returns UNKNOWN, try keyword fallback before giving up
    if (parsed.intent === "UNKNOWN") {
      const kw = keywordClassify(userMessage);
      if (kw) return { ...kw, language: parsed.language };
    }
    return parsed;
  } catch {
    // Gemini failed — use keyword fallback
    const kw = keywordClassify(userMessage);
    if (kw) return { ...kw, language: detectedLanguage || detectLanguage(userMessage) };

    return {
      intent: "UNKNOWN",
      language: detectedLanguage || detectLanguage(userMessage),
      summary_en: "Could not classify the legal problem.",
    };
  }
}
