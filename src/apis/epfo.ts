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
