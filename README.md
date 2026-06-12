# NyayaBot ⚖️

**AI-Powered Legal Aid & Welfare Assistant for Every Indian**

> Send a WhatsApp message. Get your rights. Walk into the right office with a ready document.

NyayaBot is a free WhatsApp bot that gives 500M+ low-income Indians access to legal aid in their own language — with zero app install, zero cost to the user. Send a voice note or text describing your problem and receive a legally-drafted document, your rights explained, and the nearest relevant government office — all in under 30 seconds.

---

## What It Does

| Module | Problem It Solves | Document Generated |
|---|---|---|
| ⚖️ FIR & Police Rights | Police refusing FIR, assault, harassment, illegal detention | Zero FIR draft, SP escalation notice |
| 💼 Labour & Wages | Unpaid salary, wrongful termination, PF/ESIC denial | Legal demand notice with itemised dues |
| 📋 Welfare Schemes | PM-KISAN, Ayushman, PMAY, ration card, MGNREGA | Scheme application guide |
| 🏠 Tenancy & Housing | Illegal eviction, rent hike, builder delay, RERA | Eviction shield notice |
| 🏛️ Consumer & UPI | UPI fraud, e-commerce cheating, defective product | Consumer complaint to DCDRC |
| 📄 Civil Rights & RTI | RTI applications, caste discrimination, NHRC, NCW | RTI application draft |

**Supported languages:** Hindi, English, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu, Odia, Assamese (auto-detected from voice or text)

---

## How It Works — Full Flow

```
User sends WhatsApp message (text or voice note)
            │
            ▼
    Twilio receives it
    → POST /webhook on our server
            │
            ▼
    [If voice note]
    Groq Whisper STT
    → Transcribes audio to text
    → Detects language automatically
            │
            ▼
    Keyword Classifier
    → Matches message against legal domain keywords
    → Routes to: FIR_POLICE / LABOUR_WAGE / WELFARE_SCHEME /
                 TENANCY_HOUSING / CONSUMER_COURT / CIVIL_RTI / UNKNOWN
            │
            ▼
    [If UNKNOWN] → General Conversational Handler
                   Groq LLaMA 3.3 70B answers any legal question
                   Uses conversation history for follow-up context
            │
            ▼
    Legal Module (Groq LLaMA 3.3 70B)
    → Reads conversation history from session
    → Generates: rights explanation in user's language
                 legally-formatted document body
                 next steps, escalation path
            │
            ├── Google Maps API → finds nearest relevant government office
            ├── MyScheme API → matches live welfare schemes (welfare module)
            └── EPFO links → PF/ESIC guidance (labour module)
            │
            ▼
    jsPDF → generates ready-to-submit PDF document
            │
            ▼
    Twilio → sends WhatsApp reply
    → Text message with rights + next steps
    → PDF document attachment
    Total time: under 30 seconds
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript (strict mode) |
| WhatsApp Channel | Twilio Messaging API (WhatsApp Sandbox) |
| Voice Transcription | Groq Whisper (free, fast) |
| AI Legal Reasoning | Groq LLaMA 3.3 70B — 14,400 req/day free |
| Intent Classification | Keyword regex classifier + LLaMA fallback |
| PDF Generation | jsPDF |
| Session Storage | In-memory Map (local) / Supabase PostgreSQL (production) |
| External APIs | MyScheme.gov.in, Google Maps Places, EPFO portal, eCourts |
| Hosting | Railway / Render (free tier compatible) |

---

## Project Structure

```
nyayabot/
├── src/
│   ├── index.ts          — Express server entry point
│   ├── webhook.ts        — Twilio webhook handler + conversation history
│   ├── classifier.ts     — Keyword-based intent classifier
│   ├── gemini.ts         — Groq LLaMA AI wrapper (generateJSON)
│   ├── transcriber.ts    — Groq Whisper voice transcription
│   ├── router.ts         — Routes intent to correct module
│   ├── formatter.ts      — Formats WhatsApp reply + sends via Twilio
│   ├── db.ts             — Session store (in-memory + Supabase)
│   ├── config.ts         — Environment variable loader
│   ├── types.ts          — Shared TypeScript interfaces
│   ├── dashboardData.ts  — Live activity feed (SSE)
│   ├── modules/
│   │   ├── fir.ts        — FIR & Police Rights
│   │   ├── labour.ts     — Labour & Wage Rights
│   │   ├── welfare.ts    — Welfare Scheme Navigator
│   │   ├── tenancy.ts    — Tenancy & Housing
│   │   ├── consumer.ts   — Consumer & Court
│   │   ├── rti.ts        — Civil Rights & RTI
│   │   ├── general.ts    — Conversational fallback (UNKNOWN intent)
│   │   └── offline.ts    — Offline fallback (when AI unavailable)
│   ├── apis/
│   │   ├── myscheme.ts   — MyScheme.gov.in API wrapper
│   │   ├── ecourts.ts    — eCourts case status
│   │   ├── maps.ts       — Google Maps nearest office finder
│   │   └── epfo.ts       — EPFO portal links
│   ├── generators/
│   │   ├── pdf.ts        — Legal PDF generator (jsPDF)
│   │   └── docx.ts       — Legal DOCX generator
│   └── prompts/
│       ├── classifier.ts — Classifier system prompt
│       ├── fir.ts        — FIR module system prompt
│       ├── labour.ts     — Labour module system prompt
│       ├── welfare.ts    — Welfare module system prompt
│       ├── tenancy.ts    — Tenancy module system prompt
│       ├── consumer.ts   — Consumer module system prompt
│       ├── rti.ts        — RTI module system prompt
│       └── general.ts    — General conversational prompt
├── public/
│   ├── index.html        — Live activity dashboard
│   ├── app.js            — Dashboard frontend logic
│   └── styles.css        — Dashboard styles
├── supabase/
│   └── schema.sql        — PostgreSQL schema + RLS policies
├── .env.example          — Environment variable template
└── package.json
```

---

## Local Setup (Development)

### 1. Prerequisites

- Node.js 20+
- A Twilio account (free) — [console.twilio.com](https://console.twilio.com)
- A Groq account (free) — [console.groq.com](https://console.groq.com)

### 2. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/nyayabot.git
cd nyayabot
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Twilio — get from console.twilio.com
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+your_twilio_sandbox_number

# Groq — get from console.groq.com (free, no credit card)
GROQ_API_KEY=your_groq_api_key

# Google Maps — get from console.cloud.google.com (enable Places API)
GOOGLE_AI_API_KEY=your_google_maps_api_key

# Supabase — optional, skip for local dev
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

PORT=3000
NODE_ENV=development
```

### 4. Start the Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

### 5. Expose to Twilio (WhatsApp Webhook)

Twilio needs a public HTTPS URL to send messages to. Use Cloudflare tunnel (no download needed):

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Copy the URL shown, e.g. `https://xyz.trycloudflare.com`

### 6. Configure Twilio Sandbox

1. Go to [console.twilio.com](https://console.twilio.com)
2. Messaging → Try it out → Send a WhatsApp message
3. Sandbox settings → "When a message comes in":
   ```
   https://xyz.trycloudflare.com/webhook
   ```
4. Method: POST → Save

### 7. Join Twilio Sandbox

Send this message from your WhatsApp to `+1 415 523 8886`:
```
join <your-sandbox-code>
```
(The sandbox code is shown in the Twilio console)

### 8. Test

Send any of these messages to the Twilio WhatsApp number:

```
hello
I was assaulted and police refused to file FIR
My boss has not paid salary for 3 months
How do I apply for Ayushman Bharat?
My landlord is evicting me illegally
UPI fraud — Rs 8000 stolen from my account
I want to file an RTI application
```

---

## Deployment (Railway — Permanent 24/7)

### Step 1 — Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/nyayabot.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) → **Start a New Project**
2. Sign in with GitHub → **Deploy from GitHub repo**
3. Select `YOUR_USERNAME/nyayabot`
4. Railway auto-detects Node.js and runs `npm start`

### Step 3 — Add Environment Variables

In Railway dashboard → your project → **Variables** tab → **Raw Editor**:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+your_twilio_sandbox_number
GROQ_API_KEY=your_groq_api_key
GOOGLE_AI_API_KEY=your_google_maps_api_key
NODE_ENV=production
PORT=3000
```

### Step 4 — Get Your Public URL

Railway dashboard → **Settings** → **Networking** → **Generate Domain**

You'll get a permanent URL like:
```
https://nyayabot-production.up.railway.app
```

### Step 5 — Update Twilio Webhook

Go to Twilio Sandbox settings → update webhook URL to:
```
https://nyayabot-production.up.railway.app/webhook
```

Your bot is now live permanently. No laptop needed.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/webhook` | POST | Twilio WhatsApp webhook — main entry point |
| `/webhook-test` | POST | Test endpoint — send `{"message": "...", "phone": "whatsapp:+91..."}` |
| `/health` | GET | Health check — returns service status |
| `/` | GET | Service info |
| `/api/dashboard/activity` | GET | Server-Sent Events — live activity stream |
| `/api/document/:id` | GET | Download a generated PDF document |

---

## Sample Conversations

**User:** `hello`
**NyayaBot:** Hello! I'm NyayaBot, your free AI legal assistant. Tell me your problem — FIR, unpaid wages, eviction, government schemes, consumer fraud, RTI — I can help with anything. What happened?

---

**User:** `My boss fired me without notice and hasn't paid salary for 2 months`
**NyayaBot:** You are entitled to 1 month notice pay + 2 months unpaid salary under the Payment of Wages Act 1936. Here is your legal demand notice [PDF attached]. Send it to your employer by registered post. If no response in 15 days, file a complaint with the Labour Commissioner.

---

**User:** `What if they still don't respond?`
**NyayaBot:** If your employer ignores the demand notice after 15 days, file a complaint under Section 33-C(2) of the Industrial Disputes Act at the Labour Court. You can also approach the Labour Commissioner office directly — they have the authority to recover wages. Do you know how many years you worked there? That will determine your gratuity eligibility.

---

## Resilience — Offline Mode

If the Groq AI API is unavailable (quota or network), NyayaBot automatically falls back to:

1. **Keyword classifier** — matches your message against legal domain keywords (works 100% offline)
2. **Offline module responses** — pre-built legal guidance with your actual problem embedded in the document, PDF still generated

Users always get a response, even if AI is down.

---

## Required API Keys

| Service | Purpose | Sign Up | Cost |
|---|---|---|---|
| Twilio | WhatsApp messaging | [console.twilio.com](https://console.twilio.com) | Free sandbox |
| Groq | AI reasoning + voice transcription | [console.groq.com](https://console.groq.com) | Free (14,400 req/day) |
| Google Maps | Nearest office lookup | [console.cloud.google.com](https://console.cloud.google.com) | Free tier |
| Supabase | Persistent sessions + storage | [supabase.com](https://supabase.com) | Free tier (optional) |

---

## Limitations & Notes

- **Twilio Sandbox:** For development/testing only. For production WhatsApp, apply for a dedicated WhatsApp Business number through Twilio.
- **Groq free tier:** 14,400 requests/day for LLaMA 3.3 70B. For a production bot serving thousands of users, upgrade to a paid plan.
- **Session memory:** Without Supabase configured, sessions are stored in-memory and lost on server restart. Configure Supabase for persistent cross-session conversation history.
- **Legal disclaimer:** Documents generated by NyayaBot are starting drafts. For complex or high-stakes matters, consult a qualified advocate. NALSA helpline: **15100** (free legal aid).
- **eCourts API:** Partially open. Full court case tracking requires state-level API access.
- **EPFO:** No public API exists. NyayaBot provides structured guidance and direct portal links.

---

## Contributing

Pull requests welcome. Key areas for improvement:

- Add more regional languages and language-specific legal knowledge
- Integrate real Supabase for persistent sessions
- Add WhatsApp Business API for production (non-sandbox) deployment
- Expand scheme database with state-level schemes
- Add case tracking via eCourts integration

---

## Team

**runtimeterror** — Bhavya Tejasvi, Arshjyot Kaur

Built for India's 500M+ citizens who cannot afford legal aid.

---

*NyayaBot — Free. Confidential. Available 24/7.*
*NALSA Free Legal Aid Helpline: 15100*
