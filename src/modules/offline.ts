import { UserSession, ModuleResult } from "../types";
import { generateLegalPDF } from "../generators/pdf";

const TODAY = () =>
  new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

type OfflineKey = "FIR_POLICE" | "LABOUR_WAGE" | "WELFARE_SCHEME" | "TENANCY_HOUSING" | "CONSUMER_COURT" | "CIVIL_RTI";

interface OfflineTemplate {
  summary: string;
  docTitle: string;
  docTo: string;
  docSubject: string;
  docBody: string;
  docType: string;
  docName: string;
  nextSteps: string[];
  escalation?: string;
}

const TEMPLATES: Record<OfflineKey, OfflineTemplate> = {
  FIR_POLICE: {
    summary:
      "⚖️ *Aapke FIR Adhikar (CrPC Section 154):*\n\n" +
      "1. Police FIR darz karne SE MANA NAHI kar sakti — yeh kanuni adhikar hai.\n" +
      "2. Agar police mana kare, toh *Zero FIR* kisi bhi thane mein daakhil karein.\n" +
      "3. SP (Superintendent of Police) ko likhit shikayat bhejein (Section 154(3)).\n" +
      "4. Magistrate ke paas seedha jaayein (Section 156(3) CrPC).\n" +
      "5. *24 ghante se zyada* illegal detention ek apraadh hai.\n\n" +
      "Neeche aapka draft complaint/FIR download kar sakte hain.",
    docTitle: "Application for Registration of FIR",
    docTo: "Station House Officer / Superintendent of Police",
    docSubject: "Application for Registration of FIR under Section 154 CrPC",
    docBody:
      "Respected Sir/Madam,\n\n" +
      "I am writing to formally request the registration of a First Information Report (FIR) regarding an incident that occurred recently.\n\n" +
      "Facts of the incident:\n" +
      "[Please fill in: Date, Time, Location, Description of incident, Names of accused if known]\n\n" +
      "Under Section 154 of the Code of Criminal Procedure (CrPC), I have a legal right to have my complaint registered as an FIR. " +
      "I request you to register the FIR immediately and provide me a copy as required by law.\n\n" +
      "If the FIR is not registered, I will be compelled to approach the Superintendent of Police under Section 154(3) CrPC, " +
      "and the Judicial Magistrate under Section 156(3) CrPC.\n\n" +
      "Yours faithfully,",
    docType: "POLICE COMPLAINT",
    docName: "nyayabot_fir_draft.pdf",
    nextSteps: [
      "Is draft ko bharo aur apne nearest police station jaao",
      "Ek copy apne paas rakhein, ek SHO ko dein",
      "Police refuse kare toh SP office jaao",
      "Magistrate court mein Section 156(3) application daal sakte hain",
      "NALSA helpline: 15100 (free legal aid)",
    ],
    escalation: "Agar police 48 ghante mein FIR na kare: DGP office mein complain karein aur High Court mein writ petition dakhil karein.",
  },

  LABOUR_WAGE: {
    summary:
      "💼 *Aapke Labour Adhikar:*\n\n" +
      "1. *Salary na mile:* Payment of Wages Act 1936 ke tahat 7th of every month salary milni chahiye.\n" +
      "2. *Bina notice termination:* 1 mahine ki notice ya notice pay (aakhri salary ke barabar) milni chahiye.\n" +
      "3. *Gratuity:* 5 saal baad naukri chhode toh = (last salary × years × 15/26).\n" +
      "4. *PF:* EPFO portal par balance check karein: epfindia.gov.in\n" +
      "5. *ESIC:* Medical benefits ke liye esic.in par register karein.\n\n" +
      "Neeche aapka Demand Notice download karein.",
    docTitle: "Legal Demand Notice — Unpaid Wages & Dues",
    docTo: "The Managing Director / HR Manager",
    docSubject: "Legal Notice under Payment of Wages Act 1936 and Industrial Disputes Act 1947",
    docBody:
      "Dear Sir/Madam,\n\n" +
      "I, [Your Name], was employed with your organization as [Designation] from [Start Date]. " +
      "This is a formal legal notice under the Payment of Wages Act 1936 and the Industrial Disputes Act 1947.\n\n" +
      "DUES OUTSTANDING:\n" +
      "• Pending Salary: Rs. [Amount] for [Months]\n" +
      "• Notice Pay: Rs. [Amount] (1 month salary)\n" +
      "• Gratuity (if applicable): Rs. [Amount]\n" +
      "• PF/ESIC contributions: Rs. [Amount]\n" +
      "• Total Outstanding: Rs. [Total]\n\n" +
      "You are hereby given 15 days to clear all outstanding dues. " +
      "Failure to comply will result in a complaint before the Labour Commissioner and Labour Court under Section 33-C(2) of the Industrial Disputes Act.\n\n" +
      "Yours faithfully,",
    docType: "DEMAND NOTICE",
    docName: "nyayabot_demand_notice.pdf",
    nextSteps: [
      "Is notice ko bharo aur employer ko registered post se bhejo",
      "15 din ka jawab na aaye toh Labour Commissioner office jaao",
      "EPFO balance check: passbook.epfindia.gov.in",
      "Labour Court mein Section 33-C(2) application de sakte hain",
      "ESIC grievance: esic.in/Esic/EsicWebApp/ApplicationUtilities/OnlineGrievance.faces",
    ],
  },

  WELFARE_SCHEME: {
    summary:
      "📋 *Top Sarkari Yojanaen:*\n\n" +
      "1. *PM-KISAN* — Kisaanon ko ₹6,000/saal (pmkisan.gov.in)\n" +
      "2. *Ayushman Bharat PM-JAY* — ₹5 lakh/saal health cover (beneficiary.nha.gov.in)\n" +
      "3. *PM Awas Yojana* — Ghar ke liye subsidy ₹2.67 lakh tak (pmaymis.gov.in)\n" +
      "4. *MGNREGA* — 100 din ka kaam guarantee (nrega.nic.in)\n" +
      "5. *PM Ujjwala* — Free LPG connection (pmuy.gov.in)\n" +
      "6. *Ration Card* — Subsidised anaj (nfsa.gov.in)\n\n" +
      "Apply karne ke liye nearest CSC (Common Service Centre) jaayein.",
    docTitle: "Welfare Scheme Application Guide",
    docTo: "Common Service Centre (CSC) / District Collector Office",
    docSubject: "Application for Government Welfare Schemes",
    docBody:
      "To Whom It May Concern,\n\n" +
      "I, [Your Name], resident of [Address], wish to apply for the following government welfare schemes:\n\n" +
      "1. [Scheme Name 1]\n2. [Scheme Name 2]\n3. [Scheme Name 3]\n\n" +
      "Documents I am submitting:\n" +
      "• Aadhaar Card\n• Ration Card\n• Bank Passbook\n• Income Certificate\n• Caste Certificate (if applicable)\n• Land Records (if applicable)\n\n" +
      "I request you to process my application and enroll me in the applicable schemes at the earliest.\n\n" +
      "Yours faithfully,",
    docType: "SCHEME APPLICATION",
    docName: "nyayabot_scheme_application.pdf",
    nextSteps: [
      "myscheme.gov.in par apni eligibility check karein",
      "Nearest CSC (Common Service Centre) jaayein",
      "Aadhaar, bank passbook, aur income certificate le jaayein",
      "Umeedpaar portal: umeedpaar.in",
      "Jan Samarth portal: jansamarth.in",
    ],
  },

  TENANCY_HOUSING: {
    summary:
      "🏠 *Aapke Kiraya/Ghar Adhikar:*\n\n" +
      "1. *Illegal eviction:* Makan maalik ko 15–30 din ka likhit notice dena zaroori hai.\n" +
      "2. *Zabardasti nikaalna:* Section 441/447 IPC ke tahat criminal offence hai.\n" +
      "3. *Rent hike:* 10% se zyada raise Rent Control Act ke against hain.\n" +
      "4. *Security deposit:* 2–3 mahine se zyada nahi le sakte (state dependent).\n" +
      "5. *RERA:* Builder delay ke liye RERA authority mein complaint karein.\n\n" +
      "Neeche aapka Legal Notice download karein.",
    docTitle: "Legal Notice — Protection Against Illegal Eviction",
    docTo: "Landlord / Property Owner",
    docSubject: "Cease and Desist — Illegal Eviction and Harassment",
    docBody:
      "Dear Sir/Madam,\n\n" +
      "I, [Tenant Name], have been residing at [Property Address] since [Date] under a valid tenancy agreement.\n\n" +
      "I have been informed/observed that you intend to evict me without following due legal process. " +
      "This is to notify you that:\n\n" +
      "1. Under the Transfer of Property Act 1882 and applicable State Rent Control Act, " +
      "a minimum of 15-30 days written notice is mandatory before eviction.\n\n" +
      "2. Forcible eviction without court order constitutes criminal trespass under Section 441/447 IPC " +
      "and is punishable with imprisonment.\n\n" +
      "3. Disconnecting electricity/water to force eviction is illegal under Section 24 of the Model Tenancy Act.\n\n" +
      "You are hereby directed to cease and desist from any illegal eviction attempts. " +
      "I will be compelled to file a police complaint and approach the Rent Control Tribunal if this harassment continues.\n\n" +
      "Yours faithfully,",
    docType: "EVICTION SHIELD NOTICE",
    docName: "nyayabot_eviction_shield.pdf",
    nextSteps: [
      "Is notice ko registered post se makan maalik ko bhejo",
      "WhatsApp par bhi bhejo — delivery proof ke liye screenshot lo",
      "Kisi bhi harassment par police complaint darj karwao",
      "Rent Control Tribunal mein petition daakhil karo",
      "District Legal Services Authority (DLSA) se free legal aid lo",
    ],
  },

  CONSUMER_COURT: {
    summary:
      "🏛️ *Aapke Consumer Adhikar:*\n\n" +
      "1. *UPI fraud:* Turant cybercrime.gov.in par report karo — 24 ghante mein.\n" +
      "2. *Bank complaint:* Bank nodal officer ko email karo, phir RBI Ombudsman: ombudsman.rbi.org.in\n" +
      "3. *NPCI complaint:* complaints@npci.org.in ya 1800-120-1740\n" +
      "4. *Consumer Forum:* ₹1 crore tak ke claims District Consumer Disputes Redressal Commission mein.\n" +
      "5. *E-commerce:* Platform ko likhit complaint do — CPA 2019 ke tahat jawab dena zaroori hai.\n\n" +
      "Neeche aapka Consumer Complaint download karein.",
    docTitle: "Consumer Complaint under Consumer Protection Act 2019",
    docTo: "President, District Consumer Disputes Redressal Commission",
    docSubject: "Complaint against [Company Name] for Deficiency of Service / Unfair Trade Practice",
    docBody:
      "Respected President,\n\n" +
      "I, [Complainant Name], resident of [Address], file this complaint against [Company/Opposite Party Name].\n\n" +
      "FACTS:\n" +
      "• Date of transaction/incident: [Date]\n" +
      "• Amount involved: Rs. [Amount]\n" +
      "• Description of deficiency: [What went wrong]\n" +
      "• Evidence: [Bills, screenshots, emails, messages]\n\n" +
      "RELIEF SOUGHT:\n" +
      "1. Refund of Rs. [Amount]\n" +
      "2. Compensation for mental agony: Rs. [Amount]\n" +
      "3. Litigation cost: Rs. [Amount]\n\n" +
      "I declare that the facts stated above are true to the best of my knowledge.\n\n" +
      "Yours faithfully,",
    docType: "CONSUMER COMPLAINT",
    docName: "nyayabot_consumer_complaint.pdf",
    nextSteps: [
      "Pehle company ko legal notice bhejo — 15 din ka time do",
      "UPI fraud: cybercrime.gov.in par abhi report karo",
      "RBI Ombudsman (banking): ombudsman.rbi.org.in",
      "District Consumer Forum mein complaint daakhil karo",
      "National Consumer Helpline: 1915 (free)",
    ],
  },

  CIVIL_RTI: {
    summary:
      "📄 *Aapke RTI Adhikar:*\n\n" +
      "1. *RTI file karna:* rtionline.gov.in par online ya Rs.10 postal order se.\n" +
      "2. *Response time:* 30 din mein jawab milna chahiye (Section 7).\n" +
      "3. *First appeal:* Agar jawab na aaye — Appellate Authority ke paas jaao.\n" +
      "4. *Second appeal:* CIC (Central Information Commission) ya SIC mein.\n" +
      "5. *Discrimination:* NHRC — nhrc.nic.in, NCW — ncw.nic.in mein complain karein.\n\n" +
      "Neeche aapka RTI Application download karein.",
    docTitle: "RTI Application under Section 6(1) of RTI Act 2005",
    docTo: "The Central Public Information Officer (CPIO)",
    docSubject: "Application under Right to Information Act 2005",
    docBody:
      "Respected CPIO,\n\n" +
      "I, [Applicant Name], resident of [Address], hereby request the following information under the Right to Information Act, 2005:\n\n" +
      "Department/Ministry: [Name of Department]\n\n" +
      "INFORMATION SOUGHT:\n" +
      "Q1. [Specific question — e.g., Status of my application number XYZ filed on DD/MM/YYYY]\n" +
      "Q2. [Second question if any]\n" +
      "Q3. [Third question if any]\n\n" +
      "Period: [Specify time period if relevant]\n\n" +
      "I am enclosing the application fee of Rs. 10/- by [IPO/DD/Online payment].\n\n" +
      "If the information is not provided within 30 days, I will file a First Appeal under Section 19(1) of the RTI Act.\n\n" +
      "Yours faithfully,",
    docType: "RTI APPLICATION",
    docName: "nyayabot_rti_application.pdf",
    nextSteps: [
      "Rs.10 ka Indian Postal Order (IPO) ya online payment attach karein",
      "Registered post ya rtionline.gov.in se bhejein",
      "30 din mein jawab na mile toh First Appeal karein",
      "CIC complaint: cic.gov.in",
      "NALSA free legal aid: 15100",
    ],
  },
};

export function offlineFallback(intent: OfflineKey, session: UserSession, userMessage?: string): ModuleResult {
  const t = TEMPLATES[intent];
  const today = TODAY();
  const name = String(session.context.name || "Complainant");
  const phone = session.phone.replace("whatsapp:", "");

  // Personalise the summary with the user's actual words
  const problemSnippet = userMessage
    ? `\n\n📝 *Aapki samasya:* "${userMessage.slice(0, 120)}${userMessage.length > 120 ? "..." : ""}"\n`
    : "";

  const pdfBody = userMessage
    ? t.docBody.replace(
        "[Please fill in: Date, Time, Location, Description of incident, Names of accused if known]",
        `User's reported problem: ${userMessage.slice(0, 300)}\n[Please add: exact date, time, location, and names of accused]`
      ).replace(
        "[Your Name]", name
      )
    : t.docBody;

  const pdfBuffer = generateLegalPDF({
    title: t.docTitle,
    date: today,
    toName: t.docTo,
    fromName: name,
    fromPhone: phone,
    subject: t.docSubject,
    body: pdfBody,
    documentType: t.docType,
  });

  return {
    summary: t.summary + problemSnippet,
    document: pdfBuffer,
    documentName: t.docName,
    documentMime: "application/pdf",
    nextSteps: t.nextSteps,
    escalationNotice: t.escalation,
  };
}
