import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { GENERAL_SYSTEM_PROMPT } from "../prompts/general";

const model = legalModel(GENERAL_SYSTEM_PROMPT);

interface GeneralResult {
  response: string;
  follow_up_question: string | null;
}

export async function handleGeneral(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const history = Array.isArray(session.context.history)
    ? (session.context.history as string[]).slice(-8).join("\n")
    : "";

  const prevIntent =
    session.intent && session.intent !== "UNKNOWN"
      ? `\nUser's previous topic in this session: ${session.intent}`
      : "";

  const prompt = `User message (language: ${session.language}): "${userMessage}"${prevIntent}${
    history ? `\n\nConversation history:\n${history}` : ""
  }`;

  try {
    const data = await generateJSON<GeneralResult>(model, prompt);
    const text = data.follow_up_question
      ? `${data.response}\n\n${data.follow_up_question}`
      : data.response;
    return { summary: text, nextSteps: [] };
  } catch {
    return personalFallback(userMessage, session.language, session.intent);
  }
}

function personalFallback(msg: string, lang: string, prevIntent?: string): ModuleResult {
  const lc = msg.toLowerCase().trim();

  // Greeting
  if (/^(hi|hello|namaste|helo|hay|hey|namaskar|salaam|sat sri akal)\b/i.test(lc)) {
    return {
      summary:
        lang === "hi"
          ? "Namaste! Main NyayaBot hoon — aapka muft AI legal sahayak. Aap mujhse koi bhi legal samasya share kar sakte hain — police, naukri, kiraya, yojana, consumer fraud, RTI — sab ke liye main hoon. Batayein, aaj kya hua?"
          : "Hello! I'm NyayaBot, your free AI legal assistant. Tell me your problem — FIR, unpaid wages, eviction, government schemes, consumer fraud, RTI — I can help with anything. What happened?",
      nextSteps: [],
    };
  }

  // Thanks
  if (/thank|dhanyawad|shukriya|aabhar|bahut shukriya|bahut achha/i.test(lc)) {
    return {
      summary:
        lang === "hi"
          ? "Aapka swagat hai! Mujhe khushi hai ki madad kar saka. Koi aur samasya ho toh zaroor poochein — main hamesha yahan hoon."
          : "You're welcome! Happy I could help. Feel free to reach out anytime for any legal matter.",
      nextSteps: [],
    };
  }

  // Follow-up on previous topic
  if (prevIntent && prevIntent !== "UNKNOWN") {
    const topic: Record<string, string> = {
      FIR_POLICE: "FIR aur police matter",
      LABOUR_WAGE: "labour aur wages matter",
      WELFARE_SCHEME: "sarkari yojanaen",
      TENANCY_HOUSING: "kiraya aur ghar",
      CONSUMER_COURT: "consumer complaint",
      CIVIL_RTI: "RTI aur civil rights",
    };
    const t = topic[prevIntent] || "aapki samasya";
    return {
      summary:
        lang === "hi"
          ? `Aapke ${t} ke baare mein — "${msg.slice(0, 80)}" — kripya thoda aur detail dein taaki main sahi guidance de sakoon.`
          : `Regarding your ${t} — "${msg.slice(0, 80)}" — could you share a bit more detail so I can give you the right guidance?`,
      nextSteps: [],
    };
  }

  // Generic: echo + single question
  return {
    summary:
      lang === "hi"
        ? `"${msg.slice(0, 80)}" — samajh aaya. Kripya ek sawaal batayein: Kya yeh police/FIR ka mamla hai, naukri ka, kiraya ka, ya kisi sarkari yojana ka?`
        : `I see: "${msg.slice(0, 80)}". Quick question — is this about a police complaint, unpaid wages, housing, a government scheme, or something else?`,
    nextSteps: [],
  };
}
