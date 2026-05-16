import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { fail, ok } from "@/lib/api/response";
import type { LoginRequestDTO } from "@/lib/auth/dto";
import type { LoginResponseDTO } from "@/lib/auth/dto";
import { prisma } from "@/lib/db";
import { createSessionToken, getSessionCookieName, hashSessionToken } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const SEVEN_DAYS_MS = ONE_DAY_MS * 7;

const allowedKeys = new Set<keyof LoginRequestDTO>([
  "identifier",
  "password",
  "portal",
  "rememberMe",
]);

function normalizeRememberMe(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "on" || normalized === "true" || normalized === "1";
  }
  return false;
}

async function parseBody(request: Request): Promise<Partial<LoginRequestDTO>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as Partial<LoginRequestDTO>;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return Object.fromEntries(form.entries()) as Partial<LoginRequestDTO>;
  }

  return {};
}

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(request, {
      keyPrefix: "auth-login",
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        fail("Too many login attempts. Try again later.", "RATE_LIMITED"),
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const data = await parseBody(request);
    const incomingKeys = Object.keys(data);

    for (const key of incomingKeys) {
      if (!allowedKeys.has(key as keyof LoginRequestDTO)) {
        return NextResponse.json(
          fail("Unknown field provided.", "UNKNOWN_FIELD"),
          { status: 400 }
        );
      }
    }

    const identifier =
      typeof data.identifier === "string" ? data.identifier.trim() : "";
    const password =
      typeof data.password === "string" ? data.password.trim() : "";
    const rememberMe = normalizeRememberMe(data.rememberMe);

    if (!identifier || !password) {
      return NextResponse.json(
        fail("Identifier and password are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    const rawToken = createSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(
      Date.now() + (rememberMe ? SEVEN_DAYS_MS : ONE_DAY_MS)
    );

    const user = await prisma.accountingUser.findFirst({
      where: {
        username: identifier,
      },
    });

    if (!user) {
      return NextResponse.json(
        fail("Invalid credentials.", "INVALID_CREDENTIALS"),
        { status: 401 }
      );
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return NextResponse.json(
        fail("Invalid credentials.", "INVALID_CREDENTIALS"),
        { status: 401 }
      );
    }

    await prisma.$transaction([
      prisma.accountingSession.deleteMany({
        where: {
          accountingUserId: user.id,
        },
      }),
      prisma.accountingSession.create({
        data: {
          tokenHash,
          accountingUserId: user.id,
          expiresAt,
        },
      }),
    ]);

    const response: LoginResponseDTO = {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
    };

    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });

    return NextResponse.json(ok(response, "Login successful."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
