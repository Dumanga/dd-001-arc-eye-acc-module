import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { getSessionCookieName, hashSessionToken } from "@/lib/auth/session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName())?.value;

    if (!token) {
      return NextResponse.json(
        fail("Not authenticated.", "UNAUTHORIZED"),
        { status: 401 }
      );
    }

    const tokenHash = hashSessionToken(token);
    const session = await prisma.accountingSession.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
      include: {
        accountingUser: true,
      },
    });

    if (!session?.accountingUser) {
      return NextResponse.json(
        fail("Not authenticated.", "UNAUTHORIZED"),
        { status: 401 }
      );
    }

    return NextResponse.json(
      ok(
        {
          userId: session.accountingUser.id,
          role: session.accountingUser.role,
          displayName: session.accountingUser.displayName,
          profileImageId: session.accountingUser.profileImageId,
          storeId: session.accountingUser.storeId,
          accessDashboard: session.accountingUser.accessDashboard,
          accessSuppliers: session.accountingUser.accessSuppliers,
          accessCustomers: session.accountingUser.accessCustomers,
          accessInventory: session.accountingUser.accessInventory,
          accessAccounts: session.accountingUser.accessAccounts,
          accessReports: session.accountingUser.accessReports,
          accessPos: session.accountingUser.accessPos,
          accessSettings: session.accountingUser.accessSettings,
        },
        "Session active."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
