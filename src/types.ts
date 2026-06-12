export type IntentCategory =
  | "FIR_POLICE"
  | "LABOUR_WAGE"
  | "WELFARE_SCHEME"
  | "TENANCY_HOUSING"
  | "CONSUMER_COURT"
  | "CIVIL_RTI"
  | "UNKNOWN";

export interface UserSession {
  id: string;
  phone: string;
  language: string;
  intent?: IntentCategory;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncomingMessage {
  from: string;        // E.164 WhatsApp number
  body: string;        // Text body (may be empty for voice)
  mediaUrl?: string;   // Twilio media URL for voice/image
  mediaContentType?: string;
}

export interface ModuleResult {
  summary: string;
  document?: Buffer;
  documentName?: string;
  documentMime?: string;
  officeAddress?: string;
  officeDistance?: string;
  nextSteps: string[];
  escalationNotice?: string;
}

export interface ClaudeToolCall {
  name: string;
  input: Record<string, unknown>;
}
