import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { CONSUMER_SYSTEM_PROMPT } from "../prompts/consumer";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { offlineFallback } from "./offline";

const model = legalModel(CONSUMER_SYSTEM_PROMPT);

export async function handleConsumer(
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
    return offlineFallback("CONSUMER_COURT", session, userMessage);
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Consumer Complaint"),
    date: today,
    toName: String(data.document_to || "President, District Consumer Forum"),
    fromName: String(session.context.name || "Complainant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Consumer Complaint under Consumer Protection Act 2019"),
    body: String(data.document_body || ""),
    documentType: "CONSUMER COMPLAINT",
  });

  const office = await findNearestOffice("CONSUMER_COURT");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_consumer_complaint.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    nextSteps: (data.next_steps as string[]) || [],
  };
}
