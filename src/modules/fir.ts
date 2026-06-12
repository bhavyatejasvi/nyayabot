import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { FIR_SYSTEM_PROMPT } from "../prompts/fir";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { offlineFallback } from "./offline";

const model = legalModel(FIR_SYSTEM_PROMPT);

export async function handleFIR(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  let data: Record<string, unknown>;

  try {
    data = await generateJSON<Record<string, unknown>>(
      model,
      `User's problem (language: ${session.language}): ${userMessage}\n\nUser context: ${JSON.stringify(session.context)}`
    );
  } catch {
    return offlineFallback("FIR_POLICE", session, userMessage);
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Zero FIR Draft"),
    date: today,
    toName: String(data.document_to || "Station House Officer"),
    toAddress: String(session.context.policeStation || ""),
    fromName: String(session.context.name || "Complainant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Application for FIR Registration under Section 154 CrPC"),
    body: String(data.document_body || ""),
    documentType: "POLICE COMPLAINT",
  });

  const office = await findNearestOffice("FIR_POLICE");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_fir_draft.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    officeDistance: office?.distance,
    nextSteps: (data.next_steps as string[]) || [],
    escalationNotice: data.escalation_notice as string | undefined,
  };
}
