import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { RTI_SYSTEM_PROMPT } from "../prompts/rti";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { offlineFallback } from "./offline";

const model = legalModel(RTI_SYSTEM_PROMPT);

export async function handleRTI(
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
    return offlineFallback("CIVIL_RTI", session, userMessage);
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "RTI Application"),
    date: today,
    toName: String(data.document_to || "Central Public Information Officer"),
    fromName: String(session.context.name || "Applicant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Application under Right to Information Act 2005"),
    body: String(data.document_body || ""),
    documentType: "RTI APPLICATION",
  });

  const office = await findNearestOffice("CIVIL_RTI");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_rti_application.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    nextSteps: (data.next_steps as string[]) || [],
  };
}
