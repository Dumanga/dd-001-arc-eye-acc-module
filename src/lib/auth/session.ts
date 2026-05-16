import crypto from "crypto";

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getSessionCookieName() {
  return "dob_acc_session";
}

function normalizeBaseUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.origin;
  } catch {
    return "";
  }
}

export function getAppBaseUrl(request: Request) {
  const envBase = normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL ?? "");
  if (envBase) {
    return envBase;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.trim() || "https";
    const fromForwarded = normalizeBaseUrl(
      `${forwardedProto}://${forwardedHost}`
    );
    if (fromForwarded) {
      return fromForwarded;
    }
  }

  return new URL(request.url).origin;
}
