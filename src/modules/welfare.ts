import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { WELFARE_SYSTEM_PROMPT } from "../prompts/welfare";
import { matchSchemes } from "../apis/myscheme";
import { findNearestOffice } from "../apis/maps";
import { offlineFallback } from "./offline";

const model = legalModel(WELFARE_SYSTEM_PROMPT);

export async function handleWelfare(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  // Fetch live schemes in parallel with Gemini analysis
  const [geminiResult, schemes] = await Promise.all([
    generateJSON<Record<string, unknown>>(
      model,
      `Problem (language: ${session.language}): ${userMessage}\nUser profile: ${JSON.stringify(session.context)}`
    ).catch(() => null),
    matchSchemes("GENERAL", session.context),
  ]);

  if (!geminiResult) {
    const base = offlineFallback("WELFARE_SCHEME", session);
    const schemeSummary = schemes
      .map((s, i) => `${i + 1}. *${s.name}*: ${s.description}\n   Apply: ${s.applyUrl}`)
      .join("\n\n");
    return { ...base, summary: base.summary + "\n\n" + schemeSummary };
  }

  const data = geminiResult;

  const officeResult = await findNearestOffice("WELFARE_SCHEME");

  const schemeSummary = schemes
    .map((s, i) => `${i + 1}. *${s.name}*: ${s.description}\n   Apply: ${s.applyUrl}`)
    .join("\n\n");

  const summary = `${String(data.summary || "")}\n\n📋 Aapke liye yojanaen:\n${schemeSummary}`;

  return {
    summary,
    officeAddress: officeResult
      ? `${officeResult.name} — Common Service Centre (CSC)`
      : "Nearest CSC Seva Kendra",
    officeDistance: officeResult?.distance,
    nextSteps: (data.next_steps as string[]) || [
      "Nearest CSC (Common Service Centre) jayen",
      "Aadhaar card, bank passbook, aur land record le jayen",
      "myscheme.gov.in par online check karein",
    ],
  };
}
