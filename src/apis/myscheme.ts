import axios from "axios";

export interface Scheme {
  name: string;
  description: string;
  eligibility: string;
  applyUrl: string;
  ministry: string;
}

export async function matchSchemes(
  category: string,
  userContext: Record<string, unknown>
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
