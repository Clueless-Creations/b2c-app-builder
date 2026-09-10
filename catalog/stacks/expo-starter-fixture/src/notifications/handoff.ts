import { classifyLocalNotification } from "../capabilities/reducers";
import { ROUTE_HREFS } from "../navigation/route-graph";

export function notificationRestoreHref(input: { tokenOk: boolean; receiptOk: boolean; itemId: string }): string | undefined {
  const route = ROUTE_HREFS.detail(input.itemId);
  const classified = classifyLocalNotification({
    tokenOk: input.tokenOk,
    receiptOk: input.receiptOk,
    claimedPersonSawNotification: false,
    route,
  });
  return classified.action === "accept" ? classified.restoreRoute : undefined;
}
