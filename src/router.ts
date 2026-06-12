import { IntentCategory, UserSession, ModuleResult } from "./types";
import { handleFIR } from "./modules/fir";
import { handleLabour } from "./modules/labour";
import { handleWelfare } from "./modules/welfare";
import { handleTenancy } from "./modules/tenancy";
import { handleConsumer } from "./modules/consumer";
import { handleRTI } from "./modules/rti";
import { handleGeneral } from "./modules/general";

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
      return handleGeneral(userMessage, session);
  }
}
