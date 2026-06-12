import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { TENANCY_SYSTEM_PROMPT } from "../prompts/tenancy";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { offlineFallback } from "./offline";

const model = legalModel(TENANCY_SYSTEM_PROMPT);

export async function handleTenancy(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  let data: Record<string, unknown>;

  try {
    data = await generateJSON<Record<string, unknown>>(
      model,
      `Problem (language: ${session.language}): ${userMessage}\nContext: ${JSON.stringify(session.context)}`
    );
  } catch {
    return offlineFallback("TENANCY_HOUSING", session, userMessage);
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Legal Notice — Illegal Eviction"),
    date: today,
    toName: String(data.document_to || "Landlord"),
    fromName: String(session.context.name || "Tenant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Notice Against Illegal Eviction"),
    body: String(data.document_body || ""),
    documentType: "EVICTION SHIELD NOTICE",
  });

  const office = await findNearestOffice("TENANCY_HOUSING");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_eviction_shield.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    nextSteps: (data.next_steps as string[]) || [],
  };
}
