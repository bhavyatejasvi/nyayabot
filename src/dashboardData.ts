import { EventEmitter } from "events";
import { getSupabaseClient } from "./db";
import { IntentCategory } from "./types";

// ─── Activity event stream ──────────────────────────────────────────────────

export type ActivityEventType =
  | "received"
  | "transcription"
  | "classification"
  | "document"
  | "sent"
  | "error";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  phone: string;
  detail: string;
  ts: string;
}

export const activityEmitter = new EventEmitter();
activityEmitter.setMaxListeners(64);

const activityBuffer: ActivityEvent[] = [];
const BUFFER_MAX = 100;

export function pushActivity(event: Omit<ActivityEvent, "id" | "ts">): void {
  const full: ActivityEvent = {
    ...event,
    id: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
  };
  activityBuffer.push(full);
  if (activityBuffer.length > BUFFER_MAX) activityBuffer.shift();
  activityEmitter.emit("activity", full);
}

export function getRecentActivity(limit = 40): ActivityEvent[] {
  return activityBuffer.slice(-limit).reverse();
}

// ─── Feature / module metadata ──────────────────────────────────────────────

export interface DashboardFeature {
  title: string;
  description: string;
  meta: string;
}

export interface DashboardSessionRow {
  id: string;
  phone: string;
  language: string;
  intent: IntentCategory | null;
  updated_at: string;
}

export interface DashboardDocumentRow {
  id: string;
  doc_type: string;
  doc_name: string;
  phone: string;
  created_at: string;
}

const FEATURE_LIST: DashboardFeature[] = [
  { title: "WhatsApp Intake", description: "Accepts text and voice notes through Twilio", meta: "Realtime" },
  { title: "Whisper STT", description: "Transcribes audio in 12+ Indian languages", meta: "OpenAI" },
  { title: "Intent Classifier", description: "Routes to FIR, Labour, Welfare, Tenancy, Consumer, RTI", meta: "Claude Haiku" },
  { title: "Legal Reasoning", description: "Generates legal guidance and formal document drafts", meta: "Claude Sonnet" },
  { title: "PDF / DOCX Export", description: "Creates ready-to-submit legal documents", meta: "jsPDF + docx" },
  { title: "Supabase Storage", description: "Persists sessions and stores generated documents", meta: "PostgreSQL" },
  { title: "Nearby Office Lookup", description: "Police station, labour office, CSC, court, DLSA", meta: "Google Maps" },
  { title: "WhatsApp Delivery", description: "Sends reply and document link back to the user", meta: "Twilio" },
];

// ─── Sample / fallback data ─────────────────────────────────────────────────

const SAMPLE_SESSIONS: DashboardSessionRow[] = [
  { id: "sess_101", phone: "whatsapp:+919900000001", language: "hi", intent: "FIR_POLICE",      updated_at: new Date(Date.now() - 12 * 60 * 1000).toISOString() },
  { id: "sess_102", phone: "whatsapp:+919900000002", language: "en", intent: "LABOUR_WAGE",     updated_at: new Date(Date.now() - 28 * 60 * 1000).toISOString() },
  { id: "sess_103", phone: "whatsapp:+919900000003", language: "ta", intent: "WELFARE_SCHEME",  updated_at: new Date(Date.now() - 52 * 60 * 1000).toISOString() },
  { id: "sess_104", phone: "whatsapp:+919900000004", language: "hi", intent: "TENANCY_HOUSING", updated_at: new Date(Date.now() - 83 * 60 * 1000).toISOString() },
];

const SAMPLE_DOCUMENTS: DashboardDocumentRow[] = [
  { id: "doc_201", doc_type: "POLICE COMPLAINT", doc_name: "nyayabot_fir_draft.pdf",        phone: "whatsapp:+919900000001", created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString() },
  { id: "doc_202", doc_type: "DEMAND NOTICE",    doc_name: "nyayabot_demand_notice.pdf",    phone: "whatsapp:+919900000002", created_at: new Date(Date.now() - 34 * 60 * 1000).toISOString() },
  { id: "doc_203", doc_type: "RTI APPLICATION",  doc_name: "nyayabot_rti_application.pdf",  phone: "whatsapp:+919900000005", created_at: new Date(Date.now() - 47 * 60 * 1000).toISOString() },
];

// ─── Static test responses (fallback when Claude is not configured) ─────────

const STATIC_TEST_RESPONSES: Record<string, { summary: string; nextSteps: string[] }> = {
  FIR_POLICE: {
    summary: "We have drafted a FIR/complaint. You can submit this to your local police station.",
    nextSteps: ["Visit nearest police station", "Submit the drafted FIR", "If refused, escalate to SP"],
  },
  LABOUR_WAGE: {
    summary: "A demand notice draft is ready for unpaid wages.",
    nextSteps: ["Send demand notice to employer", "If no response in 15 days, approach Labour Commissioner"],
  },
  WELFARE_SCHEME: {
    summary: "We matched some welfare schemes relevant to your profile.",
    nextSteps: ["Visit nearest CSC", "Carry Aadhaar and bank passbook"],
  },
  TENANCY_HOUSING: {
    summary: "A tenancy protection notice draft is ready.",
    nextSteps: ["Send notice to landlord", "File police complaint if eviction occurs"],
  },
  CONSUMER_COURT: {
    summary: "A consumer complaint template is ready.",
    nextSteps: ["Send legal notice to seller", "File at District Consumer Forum if unresolved"],
  },
  CIVIL_RTI: {
    summary: "An RTI application draft is ready.",
    nextSteps: ["Attach ₹10 fee", "Send to CPIO of concerned department"],
  },
  UNKNOWN: {
    summary: "Please provide more details about your legal problem.",
    nextSteps: ["Describe your issue in a sentence", "Choose: FIR, Labour, Welfare, Tenancy, Consumer, or RTI"],
  },
};

export function getStaticTestResponse(
  intent: string,
  phone?: string,
  language?: string
): { summary: string; nextSteps: string[]; intent: string; phone: string; language: string } {
  const selected = STATIC_TEST_RESPONSES[intent] || STATIC_TEST_RESPONSES.UNKNOWN;
  return { ...selected, intent, phone: phone || "whatsapp:+000", language: language || "hi" };
}

// ─── Supabase read helpers ──────────────────────────────────────────────────

async function readTable<T>(table: string, fallback: T[]): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error || !data?.length) return fallback;
    return data as T[];
  } catch {
    return fallback;
  }
}

async function countRows(table: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;
  try {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    return count || 0;
  } catch {
    return 0;
  }
}

// ─── Dashboard snapshot ─────────────────────────────────────────────────────

export function getDashboardFeatures(): DashboardFeature[] {
  return FEATURE_LIST;
}

export async function getDashboardSnapshot() {
  const [sessions, documents, sessionCount, documentCount] = await Promise.all([
    readTable<DashboardSessionRow>("sessions", SAMPLE_SESSIONS),
    readTable<DashboardDocumentRow>("documents", SAMPLE_DOCUMENTS),
    countRows("sessions"),
    countRows("documents"),
  ]);

  const moduleStats = [
    { name: "FIR_POLICE",      count: sessions.filter((r) => r.intent === "FIR_POLICE").length },
    { name: "LABOUR_WAGE",     count: sessions.filter((r) => r.intent === "LABOUR_WAGE").length },
    { name: "WELFARE_SCHEME",  count: sessions.filter((r) => r.intent === "WELFARE_SCHEME").length },
    { name: "TENANCY_HOUSING", count: sessions.filter((r) => r.intent === "TENANCY_HOUSING").length },
    { name: "CONSUMER_COURT",  count: sessions.filter((r) => r.intent === "CONSUMER_COURT").length },
    { name: "CIVIL_RTI",       count: sessions.filter((r) => r.intent === "CIVIL_RTI").length },
  ];

  return {
    meta: {
      title: "NyayaBot Dashboard",
      description: "WhatsApp legal aid command centre",
      timestamp: new Date().toISOString(),
    },
    metrics: {
      sessions: sessionCount || sessions.length,
      documents: documentCount || documents.length,
      activeModules: 6,
      recentMessages: sessions.length + documents.length,
    },
    modules: moduleStats,
    features: FEATURE_LIST,
    sessions,
    documents,
    architecture: [
      "WhatsApp",
      "Twilio webhook",
      "Whisper STT",
      "Claude Haiku",
      "Legal Router",
      "Claude Sonnet",
      "Doc Generator",
      "Twilio reply",
    ],
  };
}
