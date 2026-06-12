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
    return null;
  }
}

export function getCourtPortalUrl(state: string = "delhi"): string {
  return `https://services.ecourts.gov.in/ecourtindia_v6/?p=case_status/index&app_token=`;
}
