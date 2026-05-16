import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  getAppBaseUrl,
  getSessionCookieName,
  hashSessionToken,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const cookieName = getSessionCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.accountingSession.deleteMany({
      where: { tokenHash },
    });
  }

  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  const redirectUrl = new URL("/accounting/login", getAppBaseUrl(request));
  return NextResponse.redirect(redirectUrl);
}
