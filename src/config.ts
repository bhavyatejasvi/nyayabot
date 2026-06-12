import dotenv from "dotenv";
dotenv.config();

export const config = {
  twilio: {
    accountSid:     (process.env.TWILIO_ACCOUNT_SID     || "").trim(),
    authToken:      (process.env.TWILIO_AUTH_TOKEN       || "").trim(),
    whatsappNumber: (process.env.TWILIO_WHATSAPP_NUMBER  || "").trim(),
  },
  groq: {
    // Optional — set for voice transcription via Groq Whisper (free at console.groq.com)
    apiKey: process.env.GROQ_API_KEY || "",
  },
  googleAi: {
    // Required for legal AI — free at aistudio.google.com (no credit card)
    apiKey: process.env.GOOGLE_AI_API_KEY || "",
  },
  supabase: {
    url:            process.env.SUPABASE_URL              || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
  app: {
    port:           parseInt(process.env.PORT || "3000"),
    nodeEnv:        process.env.NODE_ENV   || "development",
    baseUrl:        process.env.BASE_URL   || "http://localhost:3000",
    dashboardTitle: process.env.DASHBOARD_TITLE || "NyayaBot Dashboard",
  },
};
