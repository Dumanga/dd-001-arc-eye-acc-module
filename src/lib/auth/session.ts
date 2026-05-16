import crypto from "crypto";

export type Portal = "OPERATION" | "ACCOUNTING";

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizePortal(value: unknown): Portal | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "OPERATION" || normalized === "ACCOUNTING") {
    return normalized;
  }
  return null;
}

export function getPortalFromPath(pathname: string): Portal {
  if (pathname.startsWith("/accounting")) {
    return "ACCOUNTING";
  }
  return "OPERATION";
}

export function resolvePortal(request: Request, explicitPortal?: unknown): Portal {
  const fromExplicit = normalizePortal(explicitPortal);
  if (fromExplicit) {
    return fromExplicit;
  }

  const url = new URL(request.url);

  const fromQuery = normalizePortal(url.searchParams.get("portal"));
  if (fromQuery) {
    return fromQuery;
  }

  const fromHeader = normalizePortal(request.headers.get("x-portal"));
  if (fromHeader) {
    return fromHeader;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererPath = new URL(referer).pathname;
      return getPortalFromPath(refererPath);
    } catch {
      // Ignore malformed referer and continue to pathname fallback.
    }
  }

  return getPortalFromPath(url.pathname);
}

export function getSessionCookieName(portal: Portal) {
  return portal === "ACCOUNTING" ? "dob_acc_session" : "dob_op_session";
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
