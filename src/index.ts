import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { config } from "./config";
import { webhookHandler } from "./webhook";
import {
  activityEmitter,
  getDashboardFeatures,
  getDashboardSnapshot,
  getRecentActivity,
  getStaticTestResponse,
  pushActivity,
} from "./dashboardData";
import { classifyIntent } from "./classifier";
import { routeToModule } from "./router";
import { getOrCreateSession, updateSession } from "./db";

const app = express();
const publicDir = path.join(process.cwd(), "public");

// ─── In-memory document store for test-generated docs ──────────────────────
interface StoredDoc {
  buffer: Buffer;
  name: string;
  mime: string;
}
const documentStore = new Map<string, StoredDoc>();

function storeDocument(buffer: Buffer, name: string, mime: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  documentStore.set(id, { buffer, name, mime });
  setTimeout(() => documentStore.delete(id), 15 * 60 * 1000); // expire in 15 min
  return id;
}

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan("combined"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── Health ─────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "NyayaBot", timestamp: new Date().toISOString() });
});

// ─── Dashboard snapshot ─────────────────────────────────────────────────────
app.get("/api/dashboard/snapshot", async (_req: Request, res: Response) => {
  try {
    res.json(await getDashboardSnapshot());
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/dashboard/features", (_req: Request, res: Response) => {
  res.json({ features: getDashboardFeatures() });
});

// ─── SSE — live activity feed ───────────────────────────────────────────────
app.get("/api/dashboard/activity", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send recent history to newly connected client
  const recent = getRecentActivity(20);
  for (const ev of recent) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  const onActivity = (ev: unknown) => {
    try {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch {}
  };

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {}
  }, 25000);

  activityEmitter.on("activity", onActivity);

  req.on("close", () => {
    clearInterval(heartbeat);
    activityEmitter.off("activity", onActivity);
  });
});

// ─── Document download (for test-generated docs) ────────────────────────────
app.get("/api/document/:id", (req: Request, res: Response) => {
  const doc = documentStore.get(String(req.params.id));
  if (!doc) {
    res.status(404).json({ error: "Document not found or expired" });
    return;
  }
  res.setHeader("Content-Type", doc.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${doc.name}"`);
  res.send(doc.buffer);
});

// ─── Webhook test — calls the real Claude pipeline ──────────────────────────
app.post("/webhook-test", async (req: Request, res: Response) => {
  const { intent: forcedIntent, message, phone, language } = req.body || {};
  const testPhone = (phone as string) || "whatsapp:+910000000000";
  const testMessage = (message as string) || "I need legal help";

  // If Claude isn't configured, return the static mock immediately
  if (!config.googleAi.apiKey) {
    res.json({ ok: true, mode: "static", result: getStaticTestResponse(forcedIntent, testPhone, language) });
    return;
  }

  pushActivity({ type: "received", phone: testPhone, detail: `[Test] "${testMessage.slice(0, 80)}"` });

  try {
    // Get / create a test session
    const session = await getOrCreateSession(testPhone);

    // Classify (or use the forced intent from the dropdown)
    let classification: { intent: string; language: string; summary_en: string };
    if (forcedIntent && forcedIntent !== "UNKNOWN") {
      classification = {
        intent: forcedIntent as string,
        language: (language as string) || "hi",
        summary_en: testMessage,
      };
    } else {
      classification = await classifyIntent(testMessage, language as string | undefined);
    }

    pushActivity({
      type: "classification",
      phone: testPhone,
      detail: `${classification.intent} · ${classification.language}`,
    });

    await updateSession(session.id, {
      language: classification.language,
      intent: classification.intent as any,
    });
    session.language = classification.language;
    session.intent = classification.intent as any;

    // Run the legal module
    const result = await routeToModule(classification.intent as any, testMessage, session);

    pushActivity({ type: "sent", phone: testPhone, detail: `[Test] ${classification.intent} result ready` });

    // Store generated document for download
    let documentId: string | undefined;
    if (result.document && result.documentName && result.documentMime) {
      documentId = storeDocument(result.document, result.documentName, result.documentMime);
      pushActivity({ type: "document", phone: testPhone, detail: result.documentName });
    }

    res.json({
      ok: true,
      mode: "live",
      classification,
      result: {
        summary: result.summary,
        nextSteps: result.nextSteps,
        officeAddress: result.officeAddress,
        officeDistance: result.officeDistance,
        escalationNotice: result.escalationNotice,
        documentName: result.documentName,
        documentMime: result.documentMime,
        documentId,
        hasDocument: !!result.document,
      },
    });
  } catch (error) {
    console.error("webhook-test error:", error);
    pushActivity({ type: "error", phone: testPhone, detail: String(error) });
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// ─── Twilio WhatsApp webhook ─────────────────────────────────────────────────
app.post("/webhook", webhookHandler);

// ─── Static files + SPA fallback ────────────────────────────────────────────
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(config.app.port, () => {
  console.log(`
  ⚖️  NyayaBot running on http://localhost:${config.app.port}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Webhook:   POST /webhook
  Dashboard: GET  /
  Activity:  GET  /api/dashboard/activity  (SSE)
  Test:      POST /webhook-test
  Docs:      GET  /api/document/:id
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

export default app;
