import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { UserSession } from "./types";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const { url, serviceRoleKey } = config.supabase;
  if (
    !url || !serviceRoleKey ||
    url.includes("xxxx") || serviceRoleKey === "eyJ..."
  ) {
    return null;
  }

  try {
    supabaseClient = createClient(url, serviceRoleKey);
    return supabaseClient;
  } catch {
    return null;
  }
}

// ── In-memory store (used when Supabase is not configured) ──────────────────
const localSessions = new Map<string, UserSession>();

export async function getOrCreateSession(phone: string): Promise<UserSession> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    const existing = localSessions.get(phone);
    if (existing) {
      const ageSec = (Date.now() - new Date(existing.updated_at).getTime()) / 1000;
      if (ageSec < 30 * 60) return existing; // reuse within 30 min
    }
    const now = new Date().toISOString();
    const session: UserSession = {
      id: `local-${Date.now()}`,
      phone,
      language: "hi",
      context: {},
      created_at: now,
      updated_at: now,
    };
    localSessions.set(phone, session);
    return session;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (data && !error) {
    const updated = new Date((data as any).updated_at);
    const now = new Date();
    if (now.getTime() - updated.getTime() < 30 * 60 * 1000) {
      return data as UserSession;
    }
  }

  const newSession: Partial<UserSession> = {
    phone,
    language: "hi",
    context: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: createError } = await supabase
    .from("sessions")
    .insert(newSession)
    .select()
    .single();

  if (createError) throw new Error(`DB session error: ${createError.message}`);
  return created as UserSession;
}

export async function updateSession(
  id: string,
  updates: Partial<UserSession>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    // Update the in-memory store directly
    for (const session of localSessions.values()) {
      if (session.id === id) {
        Object.assign(session, updates, { updated_at: new Date().toISOString() });
        break;
      }
    }
    return;
  }

  await supabase
    .from("sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function logDocument(
  sessionId: string,
  docType: string,
  docName: string,
  phone: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase.from("documents").insert({
    session_id: sessionId,
    doc_type: docType,
    doc_name: docName,
    phone,
    created_at: new Date().toISOString(),
  });
}
