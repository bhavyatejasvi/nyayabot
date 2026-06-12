import { legalModel, generateJSON } from "../gemini";
import { UserSession, ModuleResult } from "../types";
import { LABOUR_SYSTEM_PROMPT } from "../prompts/labour";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { getEpfoInfo } from "../apis/epfo";
import { offlineFallback } from "./offline";

const model = legalModel(LABOUR_SYSTEM_PROMPT);

export async function handleLabour(
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
    return offlineFallback("LABOUR_WAGE", session, userMessage);
  }

  const epfo = getEpfoInfo();
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Legal Demand Notice"),
    date: today,
    toName: String(data.document_to || "HR Manager / Employer"),
    toAddress: String(session.context.companyAddress || ""),
    fromName: String(session.context.name || "Employee"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Demand Notice for Unpaid Wages"),
    body: String(data.document_body || ""),
    documentType: "DEMAND NOTICE",
  });

  const office = await findNearestOffice("LABOUR_WAGE");
  const nextSteps = (data.next_steps as string[]) || [];
  nextSteps.push(`EPFO PF balance: ${epfo.pf_balance_url}`);

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_demand_notice.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    officeDistance: office?.distance,
    nextSteps,
  };
}
