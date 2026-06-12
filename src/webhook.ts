import { Request, Response } from "express";
import { transcribeAudio } from "./transcriber";
import { classifyIntent } from "./classifier";
import { routeToModule } from "./router";
import { sendResponse } from "./formatter";
import { getOrCreateSession, updateSession, logDocument } from "./db";
import { IncomingMessage } from "./types";
import { pushActivity } from "./dashboardData";

function parseTwilioWebhook(req: Request): IncomingMessage {
  return {
    from: req.body.From as string,
    body: (req.body.Body as string) || "",
    mediaUrl: req.body.MediaUrl0 as string | undefined,
    mediaContentType: req.body.MediaContentType0 as string | undefined,
  };
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  // Acknowledge Twilio immediately to prevent retries
  res.status(200).send("<Response></Response>");

  const msg = parseTwilioWebhook(req);
  if (!msg.from) return;

  const isVoice =
    !!msg.mediaUrl &&
    !!(msg.mediaContentType?.includes("audio") || msg.mediaContentType?.includes("ogg"));

  pushActivity({
    type: "received",
    phone: msg.from,
    detail: isVoice
      ? "Voice note received"
      : `Text: "${(msg.body || "").slice(0, 80)}"`,
  });

  try {
    // 1. Session
    const session = await getOrCreateSession(msg.from);

    // 2. Transcribe if voice
    let userText = msg.body;
    let detectedLanguage: string | undefined;

    if (isVoice) {
      try {
        const transcription = await transcribeAudio(msg.mediaUrl!);

        if (transcription) {
          userText = transcription.text;
          detectedLanguage = transcription.language;
          pushActivity({
            type: "transcription",
            phone: msg.from,
            detail: `"${transcription.text.slice(0, 80)}" [${transcription.language}]`,
          });
        } else {
          // No transcription provider configured — ask user to type
          await sendResponse(msg.from, {
            summary:
              "🎤 Voice notes are not supported in this setup.\n\n" +
              "Kripya apni samasya *text mein* type karke bhejein — Hindi, English, ya koi bhi bhasha mein.\n\n" +
              "_Please type your problem as a text message._",
            nextSteps: [],
          });
          return;
        }
      } catch (err) {
        console.error("Transcription failed:", err);
        userText = msg.body || "Voice message";
      }
    }

    if (!userText?.trim()) userText = "help";

    // 3. Classify
    const classification = await classifyIntent(userText, detectedLanguage);

    pushActivity({
      type: "classification",
      phone: msg.from,
      detail: `${classification.intent} · ${classification.language} · "${classification.summary_en.slice(0, 60)}"`,
    });

    // 4. Update session language + intent; pass existing history to modules
    session.language = classification.language;
    session.intent = classification.intent;

    // 5. Route to legal module (session.context.history is available for context)
    const result = await routeToModule(classification.intent, userText, session);

    // 6. Append to conversation history and persist session
    const prevHistory = Array.isArray(session.context.history)
      ? (session.context.history as string[])
      : [];
    const newHistory = [
      ...prevHistory,
      `User: ${userText.slice(0, 150)}`,
      `Bot: ${result.summary.slice(0, 250)}`,
    ].slice(-12); // keep last 6 exchanges

    await updateSession(session.id, {
      language: classification.language,
      intent: classification.intent,
      context: { ...session.context, history: newHistory },
    });

    // 7. Log document
    if (result.documentName) {
      await logDocument(session.id, classification.intent, result.documentName, msg.from);
      pushActivity({
        type: "document",
        phone: msg.from,
        detail: result.documentName,
      });
    }

    // 8. Send response via Twilio
    await sendResponse(msg.from, result);

    pushActivity({
      type: "sent",
      phone: msg.from,
      detail: `Reply dispatched (${classification.intent})`,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    pushActivity({ type: "error", phone: msg.from, detail: String(err) });

    try {
      const twilio = (await import("twilio")).default;
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!
      );
      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER!,
        to: msg.from,
        body: "Maafi karein, ek technical problem aayi hai. Kripya thodi der baad dobara try karein. Helpline: 15100 (NALSA)",
      });
    } catch {}
  }
}
