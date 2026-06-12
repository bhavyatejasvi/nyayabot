import twilio from "twilio";
import { config } from "./config";
import { ModuleResult } from "./types";

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

async function uploadAndSendDocument(
  to: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );

    const storagePath = `documents/${Date.now()}_${filename}`;
    const { error } = await supabase.storage
      .from("nyayabot-docs")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("nyayabot-docs")
      .getPublicUrl(storagePath);

    await twilioClient.messages.create({
      from: config.twilio.whatsappNumber,
      to,
      body: `📎 Aapka document tayaar hai: ${filename}`,
      mediaUrl: [urlData.publicUrl],
    });
  } catch {
    await twilioClient.messages.create({
      from: config.twilio.whatsappNumber,
      to,
      body: `📎 Document generated: *${filename}*\n\n(Document delivery via WhatsApp requires Supabase Storage configuration)`,
    });
  }
}

function formatWhatsAppMessage(result: ModuleResult): string {
  const lines: string[] = [];

  if (result.summary) {
    lines.push(result.summary);
  }

  if (result.officeAddress) {
    lines.push("");
    lines.push(`🏢 *Nearest Office:*`);
    lines.push(result.officeAddress);
    if (result.officeDistance) lines.push(`📍 ${result.officeDistance}`);
  }

  if (result.escalationNotice) {
    lines.push("");
    lines.push(`⚠️ *Escalation:* ${result.escalationNotice}`);
  }

  if (result.nextSteps?.length) {
    lines.push("");
    lines.push("✅ *Agle Kadam (Next Steps):*");
    result.nextSteps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
  }

  lines.push("");
  lines.push("—");
  lines.push("_NyayaBot — Muft AI Legal Sahayak_");
  lines.push("_Free. Confidential. Available 24/7._");

  return lines.join("\n");
}

export async function sendResponse(
  to: string,
  result: ModuleResult
): Promise<void> {
  const textBody = formatWhatsAppMessage(result);
  await twilioClient.messages.create({
    from: config.twilio.whatsappNumber,
    to,
    body: textBody,
  });

  if (result.document && result.documentName && result.documentMime) {
    await uploadAndSendDocument(
      to,
      result.document,
      result.documentMime,
      result.documentName
    );
  }
}

export async function sendTypingIndicator(to: string): Promise<void> {
  await twilioClient.messages.create({
    from: config.twilio.whatsappNumber,
    to,
    body: "⏳ _Aapki problem samajh raha hoon... ek second._",
  });
}
