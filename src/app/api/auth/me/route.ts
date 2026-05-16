import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { getSessionCookieName, hashSessionToken, resolvePortal } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const portal = resolvePortal(request);
    const token = cookieStore.get(getSessionCookieName(portal))?.value;

    if (!token) {
      return NextResponse.json(
        fail("Not authenticated.", "UNAUTHORIZED"),
        { status: 401 }
      );
    }

    const tokenHash = hashSessionToken(token);
    if (portal === "ACCOUNTING") {
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
    }

    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });

    if (!session?.user) {
      return NextResponse.json(
        fail("Not authenticated.", "UNAUTHORIZED"),
        { status: 401 }
      );
    }

    if (session.user.system !== "OPERATION" && session.user.system !== "BOTH") {
      return NextResponse.json(
        fail("Not authorized for this portal.", "FORBIDDEN"),
        { status: 403 }
      );
    }

    return NextResponse.json(
      ok(
        {
          userId: session.user.id,
          role: session.user.role,
          system: session.user.system,
          displayName: session.user.displayName,
          profileImageId: session.user.profileImageId,
          storeId: session.user.storeId,
          accessDashboard: session.user.accessDashboard,
          accessRepairs: session.user.accessRepairs,
          accessClients: session.user.accessClients,
          accessBrands: session.user.accessBrands,
          accessUsers: session.user.accessUsers,
          accessStores: session.user.accessStores,
          accessSms: session.user.accessSms,
          accessSettings: session.user.accessSettings,
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
