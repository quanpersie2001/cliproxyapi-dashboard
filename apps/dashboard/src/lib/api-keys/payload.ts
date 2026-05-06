import { createHash } from "crypto";

const LOCKDOWN_KEY_CONTEXT = "dashboard-lockdown";

export function deriveCliProxyLockdownApiKey(managementApiKey: string): string {
  return `sk-${createHash("sha256").update(`${LOCKDOWN_KEY_CONTEXT}:${managementApiKey}`).digest("hex")}`;
}

export function buildCliProxyApiKeyPayload(
  userKeys: string[],
  managementApiKey: string
): string[] {
  return userKeys.length > 0 ? userKeys : [deriveCliProxyLockdownApiKey(managementApiKey)];
}
