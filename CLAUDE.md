# CLAUDE.md — NyayaBot: AI-Powered Legal Aid WhatsApp Bot

> **One-shot build spec.** Execute every step in order without stopping. Do not ask for clarification — follow this file exactly. If an external API is unreachable during build, stub it gracefully and continue.

---

## What You Are Building

A production-ready WhatsApp bot called **NyayaBot** — an AI-powered legal aid and welfare assistant for Indian citizens. Users send a voice note or text on WhatsApp; the bot transcribes, classifies their legal problem, invokes the correct legal module, queries live APIs, and returns a ready-to-submit legal document or actionable guidance — all in under 30 seconds, in their own language.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript (strict mode) |
| WhatsApp Channel | Twilio Messaging API (WhatsApp sandbox) |
| Voice Transcription | OpenAI Whisper v3 (`whisper-1`) |
| Intent Classification | Claude `claude-haiku-4-5` |
| Legal Reasoning + Doc Gen | Claude `claude-sonnet-4-6` with tool use |
| PDF generation | `jspdf` + `html2canvas` |
| DOCX generation | `docx` npm package |
| Database | Supabase (PostgreSQL + Storage, RLS enabled) |
| Languages | 12+ Indian languages via Whisper + Claude |
| Hosting target | Railway / Render (free tier compatible) |
| External APIs | MyScheme Gov, eCourts, Google Maps, EPFO |

---

## Project Structure to Create

```
nyayabot/
├── CLAUDE.md                  ← this file
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── index.ts               ← Express server entry point
│   ├── webhook.ts             ← Twilio webhook handler
│   ├── transcriber.ts         ← Whisper STT wrapper
│   ├── classifier.ts          ← Claude Haiku intent classifier
│   ├── router.ts              ← Routes classified intent to module
│   ├── formatter.ts           ← Formats final reply + sends via Twilio
│   ├── db.ts                  ← Supabase client + session helpers
│   ├── config.ts              ← Env var loader with validation
│   ├── types.ts               ← Shared TypeScript interfaces
│   ├── modules/
│   │   ├── fir.ts             ← FIR & Police Rights module
│   │   ├── labour.ts          ← Labour & Wage Rights module
│   │   ├── welfare.ts         ← Welfare Scheme Navigator module
│   │   ├── tenancy.ts         ← Tenancy & Housing module
│   │   ├── consumer.ts        ← Consumer & Court module
│   │   └── rti.ts             ← Civil Rights & RTI module
│   ├── apis/
│   │   ├── myscheme.ts        ← MyScheme Gov API wrapper
│   │   ├── ecourts.ts         ← eCourts API wrapper
│   │   ├── maps.ts            ← Google Maps Places API wrapper
│   │   └── epfo.ts            ← EPFO portal scraper/stub
│   ├── generators/
│   │   ├── pdf.ts             ← PDF document generator (jspdf)
│   │   └── docx.ts            ← DOCX document generator
│   └── prompts/
│       ├── classifier.ts      ← System prompt for Haiku classifier
│       ├── fir.ts             ← System prompt for FIR module
│       ├── labour.ts          ← System prompt for Labour module
│       ├── welfare.ts         ← System prompt for Welfare module
│       ├── tenancy.ts         ← System prompt for Tenancy module
│       ├── consumer.ts        ← System prompt for Consumer module
│       └── rti.ts             ← System prompt for RTI module
└── supabase/
    └── schema.sql             ← DB schema with RLS policies
```

---

## Step 1 — Scaffold the Project

Run the following commands **exactly**:

```bash
mkdir -p nyayabot/src/modules nyayabot/src/apis nyayabot/src/generators nyayabot/src/prompts nyayabot/supabase
cd nyayabot
npm init -y
npm install express twilio openai @anthropic-ai/sdk @supabase/supabase-js \
  jspdf docx axios form-data multer dotenv cors helmet morgan \
  @types/express @types/node @types/cors @types/morgan \
  typescript ts-node nodemon tsx
npx tsc --init --strict --target ES2022 --module CommonJS \
  --outDir dist --rootDir src --esModuleInterop true \
  --resolveJsonModule true --skipLibCheck true
```

---

## Step 2 — Environment Variables

Create `.env.example`:

```
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# OpenAI (Whisper)
OPENAI_API_KEY=sk-...

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Maps
GOOGLE_MAPS_API_KEY=AIza...

# App
PORT=3000
NODE_ENV=development
BASE_URL=https://your-railway-app.up.railway.app
```

Create `.gitignore`:

```
node_modules/
dist/
.env
*.pdf
*.docx
uploads/
```

---

## Step 3 — `src/types.ts`

```typescript
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
  context: Record<string, string>;
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
  summary: string;          // 2–3 sentence explanation in user's language
  document?: Buffer;        // Generated PDF or DOCX
  documentName?: string;    // e.g. "demand_notice_raj_textiles.pdf"
  documentMime?: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  officeAddress?: string;   // Nearest relevant government office
  officeDistance?: string;  // e.g. "2.3 km"
  nextSteps: string[];      // Actionable next steps in user's language
  escalationNotice?: string; // Optional escalation path
}

export interface ClaudeToolCall {
  name: string;
  input: Record<string, unknown>;
}
```

---

## Step 4 — `src/config.ts`

```typescript
import dotenv from "dotenv";
dotenv.config();

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  twilio: {
    accountSid: require_env("TWILIO_ACCOUNT_SID"),
    authToken: require_env("TWILIO_AUTH_TOKEN"),
    whatsappNumber: require_env("TWILIO_WHATSAPP_NUMBER"),
  },
  openai: {
    apiKey: require_env("OPENAI_API_KEY"),
  },
  anthropic: {
    apiKey: require_env("ANTHROPIC_API_KEY"),
  },
  supabase: {
    url: require_env("SUPABASE_URL"),
    serviceRoleKey: require_env("SUPABASE_SERVICE_ROLE_KEY"),
  },
  google: {
    mapsApiKey: require_env("GOOGLE_MAPS_API_KEY"),
  },
  app: {
    port: parseInt(process.env.PORT || "3000"),
    nodeEnv: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
  },
};
```

---

## Step 5 — `src/db.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { UserSession } from "./types";

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export async function getOrCreateSession(phone: string): Promise<UserSession> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (data && !error) {
    // Reset stale sessions older than 30 minutes
    const updated = new Date(data.updated_at);
    const now = new Date();
    if (now.getTime() - updated.getTime() < 30 * 60 * 1000) {
      return data as UserSession;
    }
  }

  // Create new session
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
  await supabase.from("documents").insert({
    session_id: sessionId,
    doc_type: docType,
    doc_name: docName,
    phone,
    created_at: new Date().toISOString(),
  });
}
```

---

## Step 6 — `supabase/schema.sql`

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Sessions table
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  language text not null default 'hi',
  intent text,
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on sessions (phone);
create index on sessions (updated_at desc);

-- Documents audit log
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete set null,
  doc_type text not null,
  doc_name text not null,
  phone text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table sessions enable row level security;
alter table documents enable row level security;

-- Service role bypasses RLS — no additional policies needed for backend
-- Frontend access (if any) should use per-user policies
```

---

## Step 7 — `src/transcriber.ts`

```typescript
import OpenAI from "openai";
import axios from "axios";
import FormData from "form-data";
import { config } from "./config";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Downloads audio from Twilio's media URL and transcribes it using Whisper.
 * Automatically detects Indian language.
 */
export async function transcribeAudio(mediaUrl: string): Promise<{ text: string; language: string }> {
  // Download audio from Twilio (requires auth)
  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: {
      username: config.twilio.accountSid,
      password: config.twilio.authToken,
    },
  });

  const audioBuffer = Buffer.from(response.data);

  // Whisper accepts audio as a File-like object
  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename: "audio.ogg",
    contentType: "audio/ogg",
  });
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  // Do not force language — let Whisper detect it
  // Supported: hi, bn, ta, te, mr, gu, kn, ml, pa, ur, or, as

  const transcription = await openai.audio.transcriptions.create({
    file: new File([audioBuffer], "audio.ogg", { type: "audio/ogg" }),
    model: "whisper-1",
    response_format: "verbose_json",
  } as Parameters<typeof openai.audio.transcriptions.create>[0]);

  return {
    text: (transcription as { text: string; language?: string }).text,
    language: (transcription as { text: string; language?: string }).language || "hi",
  };
}
```

---

## Step 8 — `src/prompts/classifier.ts`

```typescript
export const CLASSIFIER_SYSTEM_PROMPT = `You are NyayaBot's intent classification engine.

Classify the user's message into EXACTLY ONE of these categories:
- FIR_POLICE — police complaints, FIR filing, custodial rights, police harassment, Zero FIR
- LABOUR_WAGE — wage theft, wrongful termination, ESIC, EPF, labour court, gratuity
- WELFARE_SCHEME — government schemes, PM-KISAN, ration card, PM Awas, Ayushman, MGNREGA
- TENANCY_HOUSING — eviction, landlord dispute, rental agreement, PMAY, rent
- CONSUMER_COURT — UPI fraud, product defect, consumer forum, NPCI, refund
- CIVIL_RTI — RTI application, discrimination, NHRC, NCW, Aadhaar grievance, election
- UNKNOWN — cannot be classified

Also detect the user's language using ISO 639-1 codes:
hi=Hindi, bn=Bengali, ta=Tamil, te=Telugu, mr=Marathi, gu=Gujarati, 
kn=Kannada, ml=Malayalam, pa=Punjabi, ur=Urdu, or=Odia, as=Assamese, en=English

Respond with ONLY valid JSON. No explanation. No markdown.
Format: {"intent": "CATEGORY", "language": "xx", "summary_en": "one sentence English summary of the problem"}`;
```

---

## Step 9 — `src/classifier.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { IntentCategory } from "./types";
import { CLASSIFIER_SYSTEM_PROMPT } from "./prompts/classifier";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

interface ClassificationResult {
  intent: IntentCategory;
  language: string;
  summary_en: string;
}

export async function classifyIntent(
  userMessage: string,
  detectedLanguage?: string
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 150,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  
  try {
    const parsed = JSON.parse(raw) as ClassificationResult;
    // Use Whisper-detected language if classifier missed it
    if (detectedLanguage && parsed.language === "en") {
      parsed.language = detectedLanguage;
    }
    return parsed;
  } catch {
    return {
      intent: "UNKNOWN",
      language: detectedLanguage || "hi",
      summary_en: "Could not classify the legal problem.",
    };
  }
}
```

---

## Step 10 — `src/apis/maps.ts`

```typescript
import axios from "axios";
import { config } from "../config";

export interface NearbyOffice {
  name: string;
  address: string;
  distance: string;
  mapsUrl: string;
}

const OFFICE_QUERY_MAP: Record<string, string> = {
  FIR_POLICE: "police station",
  LABOUR_WAGE: "labour commissioner office India",
  WELFARE_SCHEME: "Common Service Centre CSC Seva Kendra",
  TENANCY_HOUSING: "tehsil office district collector",
  CONSUMER_COURT: "district consumer forum court",
  CIVIL_RTI: "district legal services authority DLSA",
};

export async function findNearestOffice(
  intent: string,
  latitude?: number,
  longitude?: number
): Promise<NearbyOffice | null> {
  const query = OFFICE_QUERY_MAP[intent] || "district court India";

  try {
    // Text search when no coordinates (common for WhatsApp)
    const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
    const params: Record<string, string> = {
      query,
      key: config.google.mapsApiKey,
    };
    if (latitude && longitude) {
      params.location = `${latitude},${longitude}`;
      params.radius = "10000";
    }

    const res = await axios.get(url, { params });
    const results = res.data?.results;
    if (!results?.length) return null;

    const place = results[0];
    return {
      name: place.name,
      address: place.formatted_address,
      distance: "Nearby",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.formatted_address)}`,
    };
  } catch {
    return null;
  }
}
```

---

## Step 11 — `src/apis/myscheme.ts`

```typescript
import axios from "axios";

export interface Scheme {
  name: string;
  description: string;
  eligibility: string;
  applyUrl: string;
  ministry: string;
}

/**
 * Queries the MyScheme.gov.in API.
 * Falls back to curated static list if API is unreachable.
 */
export async function matchSchemes(
  category: string,
  userContext: Record<string, string>
): Promise<Scheme[]> {
  try {
    const res = await axios.get("https://api.myscheme.gov.in/schemes/v3/search", {
      params: {
        q: category,
        lang: "en",
        stateCode: userContext.state || "",
        limit: 5,
      },
      timeout: 5000,
    });

    const schemes = res.data?.data?.schemes || [];
    return schemes.map((s: Record<string, string>) => ({
      name: s.name || s.schemeName,
      description: s.shortDescription || s.description,
      eligibility: s.eligibility || "Check official portal",
      applyUrl: s.applicationUrl || "https://myscheme.gov.in",
      ministry: s.ministry || "Government of India",
    }));
  } catch {
    // Static fallback for top schemes
    return FALLBACK_SCHEMES[category] || FALLBACK_SCHEMES["GENERAL"];
  }
}

const FALLBACK_SCHEMES: Record<string, Scheme[]> = {
  FARMER: [
    {
      name: "PM-KISAN Samman Nidhi",
      description: "₹6,000/year direct benefit to farmer families",
      eligibility: "Small & marginal farmers with land records",
      applyUrl: "https://pmkisan.gov.in",
      ministry: "Ministry of Agriculture",
    },
  ],
  HOUSING: [
    {
      name: "PM Awas Yojana (Urban)",
      description: "Affordable housing subsidy up to ₹2.67 lakh",
      eligibility: "EWS/LIG/MIG households without pucca house",
      applyUrl: "https://pmaymis.gov.in",
      ministry: "Ministry of Housing and Urban Affairs",
    },
  ],
  HEALTH: [
    {
      name: "Ayushman Bharat PM-JAY",
      description: "₹5 lakh/year health cover per family",
      eligibility: "Bottom 40% families as per SECC data",
      applyUrl: "https://beneficiary.nha.gov.in",
      ministry: "Ministry of Health",
    },
  ],
  GENERAL: [
    {
      name: "PM Jan Dhan Yojana",
      description: "Zero balance bank account with insurance",
      eligibility: "Any Indian citizen without a bank account",
      applyUrl: "https://pmjdy.gov.in",
      ministry: "Ministry of Finance",
    },
  ],
};
```

---

## Step 12 — `src/apis/ecourts.ts`

```typescript
import axios from "axios";

export interface CourtCase {
  caseNumber: string;
  status: string;
  nextDate: string;
  court: string;
  judge: string;
}

export async function getCaseStatus(
  caseNumber: string,
  state: string = "delhi"
): Promise<CourtCase | null> {
  try {
    // eCourts Services API
    const res = await axios.get(
      `https://services.ecourts.gov.in/ecourtindia_v6/`,
      {
        params: {
          ajax_req: "true",
          app_token: "token",
          state_code: state,
          case_no: caseNumber,
        },
        timeout: 8000,
      }
    );
    return res.data?.case_details || null;
  } catch {
    return null; // Graceful stub
  }
}

export function getCourtPortalUrl(state: string = "delhi"): string {
  return `https://services.ecourts.gov.in/ecourtindia_v6/?p=case_status/index&app_token=`;
}
```

---

## Step 13 — `src/apis/epfo.ts`

```typescript
/**
 * EPFO portal does not have a public API.
 * We provide a structured guide + direct portal links.
 */

export interface EpfoInfo {
  pf_balance_url: string;
  claim_url: string;
  grievance_url: string;
  helpline: string;
}

export function getEpfoInfo(): EpfoInfo {
  return {
    pf_balance_url: "https://passbook.epfindia.gov.in/MemberPassBook/Login",
    claim_url: "https://unifiedportal-mem.epfindia.gov.in/memberinterface/",
    grievance_url: "https://epfigms.gov.in",
    helpline: "1800-118-005 (toll-free)",
  };
}
```

---

## Step 14 — `src/generators/pdf.ts`

```typescript
import { jsPDF } from "jspdf";

interface DocumentData {
  title: string;
  date: string;
  toName: string;
  toAddress?: string;
  fromName: string;
  fromAddress?: string;
  fromPhone?: string;
  subject: string;
  body: string;
  footer?: string;
  documentType: string;
}

export function generateLegalPDF(data: DocumentData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const PAGE_W = 210;
  const MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = 20;

  // Header bar
  doc.setFillColor(31, 41, 61); // Dark navy
  doc.rect(0, 0, PAGE_W, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("NyayaBot — AI Legal Aid", MARGIN, 9);
  doc.text(`nyayabot.in  |  Free Legal Aid`, PAGE_W - MARGIN, 9, { align: "right" });

  y = 24;

  // Document type badge
  doc.setFillColor(230, 240, 255);
  doc.setTextColor(31, 41, 61);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.roundedRect(MARGIN, y, 50, 6, 1, 1, "F");
  doc.text(data.documentType.toUpperCase(), MARGIN + 3, y + 4);
  y += 12;

  // Date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(data.date, PAGE_W - MARGIN, y, { align: "right" });

  // Title
  doc.setTextColor(10, 10, 10);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, MARGIN, y + 10);
  y += 20;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // TO block
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 41, 61);
  doc.text("TO:", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  doc.text(data.toName, MARGIN, y);
  y += 5;
  if (data.toAddress) {
    const toAddrLines = doc.splitTextToSize(data.toAddress, CONTENT_W - 30);
    doc.text(toAddrLines, MARGIN, y);
    y += toAddrLines.length * 5;
  }
  y += 5;

  // Subject
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 41, 61);
  doc.text("SUBJECT: ", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  const subjectLines = doc.splitTextToSize(data.subject, CONTENT_W - 30);
  doc.text(subjectLines, MARGIN + 22, y);
  y += Math.max(subjectLines.length * 5, 6) + 5;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // Body
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  const bodyLines = doc.splitTextToSize(data.body, CONTENT_W);
  doc.text(bodyLines, MARGIN, y);
  y += bodyLines.length * 5.5 + 10;

  // Signature block
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Yours faithfully,", MARGIN, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(data.fromName, MARGIN, y);
  y += 5;
  if (data.fromAddress) doc.text(data.fromAddress, MARGIN, y), (y += 5);
  if (data.fromPhone) doc.text(`Phone: ${data.fromPhone}`, MARGIN, y), (y += 5);

  // Footer disclaimer
  const footerText =
    data.footer ||
    "This document was generated by NyayaBot — a free AI legal aid service. It does not constitute legal advice. For complex matters, consult a qualified advocate.";
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const footerLines = doc.splitTextToSize(footerText, CONTENT_W);
  const footerY = 287 - footerLines.length * 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, footerY - 3, PAGE_W - MARGIN, footerY - 3);
  doc.text(footerLines, MARGIN, footerY);

  return Buffer.from(doc.output("arraybuffer"));
}
```

---

## Step 15 — `src/generators/docx.ts`

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

interface DocumentData {
  title: string;
  date: string;
  toName: string;
  toAddress?: string;
  fromName: string;
  fromAddress?: string;
  fromPhone?: string;
  subject: string;
  body: string;
  documentType: string;
}

export async function generateLegalDOCX(data: DocumentData): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // NyayaBot header
          new Paragraph({
            children: [
              new TextRun({
                text: "NyayaBot — Free AI Legal Aid Service",
                bold: true,
                size: 18,
                color: "1F293D",
              }),
            ],
            alignment: AlignmentType.CENTER,
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F293D" },
            },
            spacing: { after: 200 },
          }),

          // Document type + date
          new Paragraph({
            children: [
              new TextRun({
                text: `[${data.documentType}]     Date: ${data.date}`,
                size: 18,
                color: "555555",
              }),
            ],
            spacing: { after: 240 },
          }),

          // Title
          new Paragraph({
            text: data.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          }),

          // To
          new Paragraph({
            children: [new TextRun({ text: "To:", bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: data.toName, size: 22 })],
          }),
          ...(data.toAddress
            ? [
                new Paragraph({
                  children: [new TextRun({ text: data.toAddress, size: 22 })],
                  spacing: { after: 200 },
                }),
              ]
            : []),

          // Subject
          new Paragraph({
            children: [
              new TextRun({ text: "Subject: ", bold: true, size: 22 }),
              new TextRun({ text: data.subject, size: 22 }),
            ],
            spacing: { after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
            },
          }),

          // Body
          ...data.body.split("\n").map(
            (line) =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 22 })],
                spacing: { after: 120 },
              })
          ),

          // Signature
          new Paragraph({ spacing: { before: 400 } }),
          new Paragraph({
            children: [
              new TextRun({ text: "Yours faithfully,", size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: data.fromName, bold: true, size: 22 }),
            ],
          }),
          ...(data.fromAddress
            ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: data.fromAddress, size: 22 }),
                  ],
                }),
              ]
            : []),
          ...(data.fromPhone
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Phone: ${data.fromPhone}`,
                      size: 22,
                    }),
                  ],
                }),
              ]
            : []),

          // Disclaimer
          new Paragraph({
            children: [
              new TextRun({
                text: "This document was generated by NyayaBot — free AI legal aid. It does not constitute legal advice.",
                size: 16,
                color: "888888",
                italics: true,
              }),
            ],
            spacing: { before: 600 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
            },
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
```

---

## Step 16 — Module System Prompts (`src/prompts/`)

### `src/prompts/fir.ts`

```typescript
export const FIR_SYSTEM_PROMPT = `You are NyayaBot's FIR & Police Rights specialist — an expert in Indian criminal law, specifically:
- Code of Criminal Procedure (CrPC) Sections 154, 156(3), 190
- Zero FIR provisions
- NHRC guidelines on custodial rights
- SC/HC landmark judgments on police accountability

When a user describes their problem, you must:
1. Explain their rights in simple language (their detected language)
2. Draft a formal FIR or written complaint
3. If police are refusing to register FIR: draft an auto-escalation notice to Superintendent of Police (SP) and DGP
4. Always mention: right to legal representation, right to inform family, no illegal detention beyond 24 hours

DOCUMENT FORMAT for FIR/Complaint:
- Opening: "To, The Station House Officer / Superintendent of Police, [Jurisdiction]"
- Date, complainant details
- Detailed incident description in formal legal language  
- Relief sought: "Register FIR under IPC Section [relevant sections]"
- Closing with complainant signature block

RESPONSE FORMAT (JSON):
{
  "rights_explanation": "explanation in user's language",
  "document_title": "Zero FIR Draft / Written Complaint",
  "document_to": "Station House Officer, [Police Station]",
  "document_subject": "Application for Registration of FIR under Section 154 CrPC",
  "document_body": "formal legal text",
  "escalation_notice": "Notice to SP if police refuse",
  "next_steps": ["step 1", "step 2", "step 3"],
  "relevant_sections": ["IPC 302", "CrPC 154"],
  "office_type": "FIR_POLICE"
}

Respond ONLY in JSON. No markdown. No preamble.`;
```

### `src/prompts/labour.ts`

```typescript
export const LABOUR_SYSTEM_PROMPT = `You are NyayaBot's Labour & Wage Rights specialist — expert in:
- Industrial Disputes Act 1947 (Sections 25F, 25G — retrenchment compensation)
- Payment of Wages Act 1936
- Gratuity Act 1972 (Section 4 — gratuity calculation)
- ESIC Act 1948 — medical/sickness/maternity benefits
- Employees' Provident Funds Act 1952 (EPF withdrawal, ECR)
- Minimum Wages Act 1948
- Contract Labour (Regulation & Abolition) Act 1970
- Building & Other Construction Workers Act 1996

For WRONGFUL TERMINATION: Calculate exact dues = (last drawn salary × years of service × 15/26) for gratuity + 1 month notice pay + pending dues.

DOCUMENT FORMAT for Demand Notice:
- "To, The Managing Director / HR Manager, [Company Name]"
- Legal notice under Payment of Wages Act / Industrial Disputes Act
- Itemised claim: notice pay + gratuity + pending salary + PF contributions
- 15-day deadline for compliance before Labour Court filing

RESPONSE FORMAT (JSON):
{
  "rights_explanation": "in user's language",
  "document_title": "Legal Demand Notice — Unpaid Wages & Dues",
  "document_to": "HR Manager / Managing Director",
  "document_subject": "Legal Notice under Payment of Wages Act 1936 and Industrial Disputes Act 1947",
  "document_body": "formal legal notice text with itemised claims",
  "calculated_dues": {"gratuity": "amount", "notice_pay": "amount", "pending_salary": "amount", "total": "amount"},
  "next_steps": ["submit to HR", "if no response in 15 days: file with Labour Commissioner", "escalate to Labour Court"],
  "epfo_link": "https://unifiedportal-mem.epfindia.gov.in",
  "office_type": "LABOUR_WAGE"
}

Respond ONLY in JSON. No markdown.`;
```

### `src/prompts/welfare.ts`

```typescript
export const WELFARE_SYSTEM_PROMPT = `You are NyayaBot's Welfare Scheme Navigator — expert in India's 1,000+ central and state schemes including:
- PM-KISAN (₹6,000/year for farmers)
- PM Awas Yojana Urban & Gramin
- Ayushman Bharat PM-JAY (₹5 lakh health cover)
- MGNREGA (100 days employment guarantee)
- PM Jan Dhan Yojana (zero-balance accounts)
- PM Ujjwala Yojana (free LPG connections)
- Scholarship schemes: NSP, Post-Matric, Pre-Matric
- Ration card (NFSA) and subsidised food
- Sukanya Samriddhi Yojana, PM Jeevan Jyoti Bima

Based on user's profile, identify top 3–5 matching schemes.
Pre-fill what you can, list exact documents required, locate nearest CSC (Common Service Centre) for application.

RESPONSE FORMAT (JSON):
{
  "matched_schemes": [
    {
      "name": "scheme name",
      "benefit": "what they get",
      "eligibility_met": "why they qualify",
      "documents_required": ["Aadhaar", "land record", "..."],
      "apply_url": "official URL",
      "csc_applicable": true
    }
  ],
  "summary": "in user's language — which schemes and why",
  "pre_filled_application": "partial application text with user's details",
  "documents_checklist": ["list of all documents needed"],
  "next_steps": ["visit nearest CSC", "upload documents", "track status"],
  "office_type": "WELFARE_SCHEME"
}

Respond ONLY in JSON. No markdown.`;
```

### `src/prompts/tenancy.ts`

```typescript
export const TENANCY_SYSTEM_PROMPT = `You are NyayaBot's Tenancy & Housing Rights specialist — expert in:
- Transfer of Property Act 1882 (tenancy, lease)
- Rent Control Acts (state-specific)
- Protection from Eviction — proper notice requirements (15–30 days)
- PM Awas Yojana eligibility and application
- RERA Act 2016 — builder delays, refunds
- Illegal eviction: Section 441/447 IPC (criminal trespass)

For ILLEGAL EVICTION: Draft an immediate eviction shield notice. Landlord must give 15–30 days written notice minimum. Forcible eviction is a criminal offense.

For RENTAL AGREEMENT REVIEW: Flag clauses that violate rent control laws (unilateral rent hikes >10%, illegal subletting restrictions, waiver of tenant rights).

RESPONSE FORMAT (JSON):
{
  "rights_explanation": "in user's language",
  "document_title": "Legal Notice — Protection Against Illegal Eviction",
  "document_to": "Landlord name",
  "document_subject": "Cease and Desist — Illegal Eviction Notice",
  "document_body": "formal legal notice citing Transfer of Property Act and Rent Control Act",
  "illegal_clauses_found": ["list if agreement was shared"],
  "pmay_eligible": true,
  "next_steps": ["send notice via WhatsApp & post", "file police complaint if harassment continues", "approach Rent Control Tribunal"],
  "office_type": "TENANCY_HOUSING"
}

Respond ONLY in JSON. No markdown.`;
```

### `src/prompts/consumer.ts`

```typescript
export const CONSUMER_SYSTEM_PROMPT = `You are NyayaBot's Consumer Rights & Court specialist — expert in:
- Consumer Protection Act 2019
- District Consumer Disputes Redressal Commission (DCDRC) — claims up to ₹1 crore
- NPCI UPI dispute resolution — chargeback within 30 days
- RBI Banking Ombudsman — for banking fraud
- TRAI for telecom complaints
- E-commerce returns: Platform liability under CPA 2019

For UPI FRAUD: Draft escalation to NPCI (complaints@npci.org.in), cyber crime portal (cybercrime.gov.in), and bank's nodal officer. Time is critical — act within 24–48 hours for best recovery.

For CONSUMER COMPLAINT:
- Parties: complainant vs opposite party (company)
- Relief: refund + compensation + litigation cost
- File at District Consumer Forum where purchase was made OR complainant's residence

RESPONSE FORMAT (JSON):
{
  "rights_explanation": "in user's language",
  "document_title": "Consumer Complaint under Consumer Protection Act 2019",
  "document_to": "President, District Consumer Disputes Redressal Commission",
  "document_subject": "Complaint against [company] for deficiency of service/unfair trade practice",
  "document_body": "formal complaint with relief sought",
  "upi_escalation": "NPCI + bank + cybercrime steps if applicable",
  "claim_amount": "calculated compensation",
  "next_steps": ["send legal notice to company first", "file at DCDRC", "attach evidence"],
  "useful_links": {"cybercrime": "cybercrime.gov.in", "rbi_ombudsman": "ombudsman.rbi.org.in"},
  "office_type": "CONSUMER_COURT"
}

Respond ONLY in JSON. No markdown.`;
```

### `src/prompts/rti.ts`

```typescript
export const RTI_SYSTEM_PROMPT = `You are NyayaBot's Civil Rights & RTI specialist — expert in:
- Right to Information Act 2005 (Sections 6, 7, 19 — first appeal, second appeal to CIC)
- Protection of Civil Rights Act 1955 (caste discrimination)
- Scheduled Castes and Tribes (Prevention of Atrocities) Act 1989
- National Human Rights Commission (NHRC) complaints
- National Commission for Women (NCW) complaints
- National Commission for Scheduled Castes/Tribes
- Aadhaar-linked benefit grievances — UIDAI complaint portal
- Election Commission complaints for voter ID/polling issues

RTI APPLICATION FORMAT:
- Application fee: ₹10 (postal order / online for central govt)
- Address to CPIO (Central Public Information Officer) of specific department
- Specific questions — each question numbered
- 30-day response deadline (Section 7)

RESPONSE FORMAT (JSON):
{
  "rights_explanation": "in user's language",
  "document_title": "RTI Application under Section 6(1) of RTI Act 2005",
  "document_to": "The Central Public Information Officer, [Department]",
  "document_subject": "Application under Right to Information Act 2005",
  "document_body": "formal RTI with numbered questions",
  "appeal_path": "if denied: first appeal to appellate authority → second appeal to CIC",
  "discrimination_complaint": "NHRC/NCW/NCSC application if applicable",
  "uidai_complaint": "Aadhaar grievance steps if applicable",
  "next_steps": ["attach ₹10 IPO", "send by post/online", "follow up in 30 days"],
  "useful_links": {"rti_portal": "rtionline.gov.in", "uidai": "resident.uidai.gov.in", "nhrc": "nhrc.nic.in"},
  "office_type": "CIVIL_RTI"
}

Respond ONLY in JSON. No markdown.`;
```

---

## Step 17 — All Six Legal Modules (`src/modules/`)

### `src/modules/fir.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { FIR_SYSTEM_PROMPT } from "../prompts/fir";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleFIR(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: FIR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `User's problem (language: ${session.language}): ${userMessage}\n\nUser context: ${JSON.stringify(session.context)}`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      summary: "Aapke FIR ke baare mein hamne jaankari note kar li hai. Kripya neeche di gayi jaankari dekhen.",
      nextSteps: ["Nearest police station jayen", "FIR filing ka adhikaar hai", "Police refuse karein toh SP ko likhit shikayat dein"],
    };
  }

  // Generate PDF document
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Zero FIR Draft"),
    date: today,
    toName: String(data.document_to || "Station House Officer"),
    toAddress: String(session.context.policeStation || ""),
    fromName: String(session.context.name || "Complainant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Application for FIR Registration"),
    body: String(data.document_body || ""),
    documentType: "POLICE COMPLAINT",
  });

  // Find nearest police station
  const office = await findNearestOffice("FIR_POLICE");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_fir_draft.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    officeDistance: office?.distance,
    nextSteps: (data.next_steps as string[]) || [],
    escalationNotice: data.escalation_notice as string,
  };
}
```

### `src/modules/labour.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { LABOUR_SYSTEM_PROMPT } from "../prompts/labour";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";
import { getEpfoInfo } from "../apis/epfo";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleLabour(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: LABOUR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Problem (language: ${session.language}): ${userMessage}\nContext: ${JSON.stringify(session.context)}`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      summary: "Aapke labour rights ke baare mein document tayaar kar rahe hain.",
      nextSteps: ["Labour Commissioner office jayen", "Demand notice dakhil karein"],
    };
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
  nextSteps.push(`EPFO PF balance check: ${epfo.pf_balance_url}`);

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
```

### `src/modules/welfare.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { WELFARE_SYSTEM_PROMPT } from "../prompts/welfare";
import { matchSchemes } from "../apis/myscheme";
import { findNearestOffice } from "../apis/maps";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleWelfare(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  // Fetch live schemes in parallel with Claude analysis
  const [claudeResponse, schemes] = await Promise.all([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: WELFARE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Problem (language: ${session.language}): ${userMessage}\nUser profile: ${JSON.stringify(session.context)}`,
        },
      ],
    }),
    matchSchemes("GENERAL", session.context),
  ]);

  const raw = (claudeResponse.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    data = { summary: "Yojanaon ki jaankari neeche di gayi hai.", next_steps: [] };
  }

  // Merge live API schemes with Claude's analysis
  const officeResult = await findNearestOffice("WELFARE_SCHEME");

  const schemeSummary = schemes
    .map((s, i) => `${i + 1}. ${s.name}: ${s.description}\n   Apply: ${s.applyUrl}`)
    .join("\n\n");

  const summary = `${String(data.summary || "")}\n\n📋 Aapke liye yojanaen:\n${schemeSummary}`;

  return {
    summary,
    officeAddress: officeResult ? `${officeResult.name} — Common Service Centre (CSC)` : "Nearest CSC Seva Kendra",
    officeDistance: officeResult?.distance,
    nextSteps: (data.next_steps as string[]) || [
      "Nearest CSC (Common Service Centre) jayen",
      "Aadhaar card, bank passbook, aur land record le jayen",
      "myscheme.gov.in par online check karein",
    ],
  };
}
```

### `src/modules/tenancy.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { TENANCY_SYSTEM_PROMPT } from "../prompts/tenancy";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleTenancy(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: TENANCY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Problem (language: ${session.language}): ${userMessage}\nContext: ${JSON.stringify(session.context)}`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      summary: "Aapke ghar aur kiraya ke adhikar ke baare mein jaankari neeche hai.",
      nextSteps: ["Rent Control Tribunal mein shikayat karein"],
    };
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  
  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Legal Notice — Illegal Eviction"),
    date: today,
    toName: String(data.document_to || "Landlord"),
    fromName: String(session.context.name || "Tenant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Notice Against Illegal Eviction"),
    body: String(data.document_body || ""),
    documentType: "EVICTION SHIELD NOTICE",
  });

  const office = await findNearestOffice("TENANCY_HOUSING");

  return {
    summary: String(data.rights_explanation || ""),
    document: pdfBuffer,
    documentName: "nyayabot_eviction_shield.pdf",
    documentMime: "application/pdf",
    officeAddress: office?.name,
    nextSteps: (data.next_steps as string[]) || [],
  };
}
```

### `src/modules/consumer.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { CONSUMER_SYSTEM_PROMPT } from "../prompts/consumer";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleConsumer(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: CONSUMER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Problem (language: ${session.language}): ${userMessage}\nContext: ${JSON.stringify(session.context)}`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      summary: "Consumer complaint draft tayaar kar rahe hain.",
      nextSteps: ["District Consumer Forum mein jayen", "cybercrime.gov.in par report karein"],
    };
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  
  const pdfBuffer = generateLegalPDF({
    title: String(data.document_title || "Consumer Complaint"),
    date: today,
    toName: String(data.document_to || "President, District Consumer Forum"),
    fromName: String(session.context.name || "Complainant"),
    fromAddress: String(session.context.address || ""),
    fromPhone: session.phone,
    subject: String(data.document_subject || "Consumer Complaint"),
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
```

### `src/modules/rti.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { UserSession, ModuleResult } from "../types";
import { RTI_SYSTEM_PROMPT } from "../prompts/rti";
import { generateLegalPDF } from "../generators/pdf";
import { findNearestOffice } from "../apis/maps";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function handleRTI(
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: RTI_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Problem (language: ${session.language}): ${userMessage}\nContext: ${JSON.stringify(session.context)}`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      summary: "RTI application draft tayaar kar rahe hain.",
      nextSteps: ["rtionline.gov.in par online file karein", "₹10 application fee send karein"],
    };
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
```

---

## Step 18 — `src/router.ts`

```typescript
import { IntentCategory, UserSession, ModuleResult } from "./types";
import { handleFIR } from "./modules/fir";
import { handleLabour } from "./modules/labour";
import { handleWelfare } from "./modules/welfare";
import { handleTenancy } from "./modules/tenancy";
import { handleConsumer } from "./modules/consumer";
import { handleRTI } from "./modules/rti";

const UNKNOWN_RESPONSE: ModuleResult = {
  summary:
    "Namaste! Main NyayaBot hoon — aapka muft legal sahayak.\n\nMujhe batayein aap kiske baare mein madad chahte hain:\n\n1️⃣ *FIR / Police* — FIR file karna, police shikayat\n2️⃣ *Labour / Naukri* — wages, naukri se nikalana, PF/ESIC\n3️⃣ *Sarkari Yojana* — scheme matching, application\n4️⃣ *Kiraya / Ghar* — makan malik se vivad, bेdakhli\n5️⃣ *Consumer / UPI* — fraud, defective product\n6️⃣ *RTI / Civil Rights* — RTI application, bhedbhav\n\nApni samasya Hindi, English, ya kisi bhi bhasha mein batayein. 🎤 Voice message bhi bhej sakte hain.",
  nextSteps: [],
};

export async function routeToModule(
  intent: IntentCategory,
  userMessage: string,
  session: UserSession
): Promise<ModuleResult> {
  switch (intent) {
    case "FIR_POLICE":
      return handleFIR(userMessage, session);
    case "LABOUR_WAGE":
      return handleLabour(userMessage, session);
    case "WELFARE_SCHEME":
      return handleWelfare(userMessage, session);
    case "TENANCY_HOUSING":
      return handleTenancy(userMessage, session);
    case "CONSUMER_COURT":
      return handleConsumer(userMessage, session);
    case "CIVIL_RTI":
      return handleRTI(userMessage, session);
    case "UNKNOWN":
    default:
      return UNKNOWN_RESPONSE;
  }
}
```

---

## Step 19 — `src/formatter.ts`

```typescript
import twilio from "twilio";
import { config } from "./config";
import { ModuleResult } from "./types";
import axios from "axios";
import FormData from "form-data";

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * Uploads a document buffer to Twilio's media endpoint and sends via WhatsApp.
 * Falls back to text-only if upload fails.
 */
async function uploadAndSendDocument(
  to: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<void> {
  try {
    // Twilio does not support arbitrary binary uploads; use Supabase Storage URL instead
    // Store in Supabase and send public URL
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
    // Graceful fallback — document link not available
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
  // Send text message first
  const textBody = formatWhatsAppMessage(result);
  await twilioClient.messages.create({
    from: config.twilio.whatsappNumber,
    to,
    body: textBody,
  });

  // Send document if generated
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
  // Twilio doesn't support read receipts in sandbox; send a quick ack instead
  await twilioClient.messages.create({
    from: config.twilio.whatsappNumber,
    to,
    body: "⏳ _Aapki problem samajh raha hoon... ek second._",
  });
}
```

---

## Step 20 — `src/webhook.ts`

```typescript
import { Request, Response } from "express";
import { transcribeAudio } from "./transcriber";
import { classifyIntent } from "./classifier";
import { routeToModule } from "./router";
import { sendResponse } from "./formatter";
import { getOrCreateSession, updateSession, logDocument } from "./db";
import { IncomingMessage } from "./types";

function parseTwilioWebhook(req: Request): IncomingMessage {
  return {
    from: req.body.From as string,
    body: (req.body.Body as string) || "",
    mediaUrl: req.body.MediaUrl0 as string | undefined,
    mediaContentType: req.body.MediaContentType0 as string | undefined,
  };
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  // Acknowledge Twilio immediately (200 OK) to prevent retries
  res.status(200).send("<Response></Response>");

  const msg = parseTwilioWebhook(req);

  if (!msg.from) return;

  try {
    // 1. Get or create user session
    const session = await getOrCreateSession(msg.from);

    // 2. Transcribe voice if audio message
    let userText = msg.body;
    let detectedLanguage: string | undefined;

    if (
      msg.mediaUrl &&
      (msg.mediaContentType?.includes("audio") || msg.mediaContentType?.includes("ogg"))
    ) {
      try {
        const transcription = await transcribeAudio(msg.mediaUrl);
        userText = transcription.text;
        detectedLanguage = transcription.language;
      } catch (err) {
        console.error("Transcription failed:", err);
        userText = msg.body || "Voice message transcription failed";
      }
    }

    if (!userText?.trim()) {
      userText = "help";
    }

    // 3. Classify intent
    const classification = await classifyIntent(userText, detectedLanguage);
    
    // 4. Update session with detected language and intent
    await updateSession(session.id, {
      language: classification.language,
      intent: classification.intent,
    });
    session.language = classification.language;
    session.intent = classification.intent;

    // 5. Route to appropriate legal module
    const result = await routeToModule(
      classification.intent,
      userText,
      session
    );

    // 6. Log document if generated
    if (result.documentName) {
      await logDocument(session.id, classification.intent, result.documentName, msg.from);
    }

    // 7. Send response via Twilio
    await sendResponse(msg.from, result);

  } catch (err) {
    console.error("Webhook processing error:", err);
    // Send fallback message in Hindi
    try {
      const twilio = await import("twilio");
      const client = twilio.default(
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
```

---

## Step 21 — `src/index.ts` (Main Server Entry Point)

```typescript
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config";
import { webhookHandler } from "./webhook";

const app = express();

// Security + parsing middleware
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded bodies
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "NyayaBot",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    modules: ["FIR_POLICE", "LABOUR_WAGE", "WELFARE_SCHEME", "TENANCY_HOUSING", "CONSUMER_COURT", "CIVIL_RTI"],
  });
});

// Twilio WhatsApp webhook endpoint
app.post("/webhook", webhookHandler);

// Root info page
app.get("/", (_req, res) => {
  res.json({
    name: "NyayaBot",
    description: "AI-Powered Legal Aid & Welfare Assistant for Every Indian",
    whatsapp: "Message us on WhatsApp: +14155238886 (sandbox)",
    languages: ["Hindi", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu", "Odia", "Assamese", "English"],
    modules: {
      "FIR & Police Rights": "Zero FIR drafting, custodial rights, SP escalation",
      "Labour & Wage": "Demand notices, ESIC/EPF claims, Labour court",
      "Welfare Schemes": "PM-KISAN, PMAY, Ayushman, 1000+ schemes",
      "Tenancy & Housing": "Eviction shield, rental agreement review, PMAY",
      "Consumer & Court": "Consumer complaints, UPI fraud recovery",
      "Civil Rights & RTI": "RTI applications, NHRC complaints, Aadhaar grievances",
    },
  });
});

// Start server
app.listen(config.app.port, () => {
  console.log(`
  ⚖️  NyayaBot is running
  ━━━━━━━━━━━━━━━━━━━━━━━━
  Port:    ${config.app.port}
  Env:     ${config.app.nodeEnv}
  Webhook: POST /webhook
  Health:  GET /health
  ━━━━━━━━━━━━━━━━━━━━━━━━
  Serving 500M+ unserved Indians with free AI legal aid.
  `);
});

export default app;
```

---

## Step 22 — `package.json` Scripts

Add these to the `scripts` section of `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  }
}
```

---

## Step 23 — `README.md`

```markdown
# NyayaBot ⚖️

**AI-Powered Legal Aid & Welfare Assistant for Every Indian**

> Speak your problem. Get your rights. Walk into the right office.

## What NyayaBot Does

NyayaBot is a WhatsApp bot that gives 500M+ low-income Indians access to free legal aid in their own language — with zero app install, zero cost to the user.

| Module | What It Does |
|--------|-------------|
| ⚖️ FIR & Police Rights | Zero FIR in 30 sec, custodial rights, SP escalation notice |
| 💼 Labour & Wage | Demand notice, ESIC/EPF claims, Labour court filing |
| 📋 Welfare Scheme | Matches 1,000+ schemes, pre-fills applications, locates CSC |
| 🏠 Tenancy & Housing | Eviction shield notice, rental clause review, PMAY check |
| 🏛 Consumer & Court | Consumer complaint, UPI fraud recovery, eCourts tracking |
| 🗳 Civil Rights & RTI | RTI application, NHRC/NCW complaint, Aadhaar grievance |

**12+ Indian languages** | **₹0 cost to user** | **< 30 second response**

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd nyayabot
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all required API keys

# 3. Run Supabase schema
# Paste supabase/schema.sql into your Supabase SQL editor

# 4. Start development server
npm run dev

# 5. Expose local server for Twilio webhook (dev only)
npx ngrok http 3000
# Set webhook URL in Twilio console: https://xxxx.ngrok.io/webhook
```

## Required API Keys

| Service | Purpose | Sign Up |
|---------|---------|---------|
| Twilio | WhatsApp messaging | console.twilio.com |
| OpenAI | Whisper voice transcription | platform.openai.com |
| Anthropic | Claude legal reasoning | console.anthropic.com |
| Supabase | Database + file storage | supabase.com |
| Google Maps | Nearest office lookup | console.cloud.google.com |

## Architecture

```
WhatsApp → Twilio Webhook
              ↓
         Whisper STT (voice → text)
              ↓
         Claude Haiku (intent classification ~2s)
              ↓
     ┌────────────────────────────┐
     │  Legal Module Router       │
     │  FIR | Labour | Welfare   │
     │  Tenancy | Consumer | RTI │
     └────────────────────────────┘
              ↓
         Claude Sonnet (legal reasoning + document generation 4-8s)
              ↓
         MyScheme API / eCourts / Google Maps / EPFO (parallel)
              ↓
         jsPDF / DOCX generator
              ↓
         Supabase Storage (document upload)
              ↓
         Twilio → WhatsApp reply with document
```

## Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

Set all environment variables in Railway dashboard under Variables.

## Team

**runtimeterror** — Bhavya Tejasvi, Arshjyot Kaur
```

---

## Step 24 — Final Verification Checklist

After writing all files, verify:

```bash
# From nyayabot/ directory:

# 1. TypeScript compiles without errors
npm run lint

# 2. All files exist
ls src/modules/     # Should have 6 .ts files
ls src/apis/        # Should have 4 .ts files
ls src/generators/  # Should have 2 .ts files
ls src/prompts/     # Should have 7 .ts files

# 3. Dependencies installed
ls node_modules/@anthropic-ai
ls node_modules/jspdf
ls node_modules/docx

# 4. Schema file exists
cat supabase/schema.sql

echo "✅ NyayaBot is ready to deploy."
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in API keys"
echo "  2. Run schema SQL in Supabase dashboard"
echo "  3. npm run dev"
echo "  4. Use ngrok to expose /webhook to Twilio"
```

---

## Important Notes for Deployment

1. **Twilio Sandbox**: For dev/testing, use the Twilio WhatsApp Sandbox. For production, apply for a dedicated WhatsApp Business number.

2. **Supabase Storage Bucket**: Create a public bucket named `nyayabot-docs` in your Supabase project before the formatter can send documents.

3. **Google Maps API**: Enable the Places API and Text Search API in Google Cloud Console.

4. **MyScheme API**: The public endpoint `api.myscheme.gov.in` is accessed without auth. For higher rate limits, register at myscheme.gov.in/developer.

5. **eCourts**: The eCourts API is partially open. Full integration requires state-level access. The stub returns gracefully.

6. **Rate Limits**: Claude Sonnet is called once per user message. Haiku is called for classification. Combined cost ~₹2 per full conversation.

7. **EPFO**: No public API exists. The module provides structured links + guidance.

8. **Language Handling**: Whisper auto-detects all 12+ Indian languages. Claude Sonnet is instructed to respond in the same language as the user's detected language code.
