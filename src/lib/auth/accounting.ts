import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AccountingUser } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSessionCookieName, hashSessionToken } from "@/lib/auth/session";

export type AccountingAccessKey =
  | "dashboard"
  | "suppliers"
  | "customers"
  | "inventory"
  | "accounts"
  | "reports"
  | "pos"
  | "settings";

const accessFieldByKey: Record<AccountingAccessKey, keyof AccountingUser> = {
  dashboard: "accessDashboard",
  suppliers: "accessSuppliers",
  customers: "accessCustomers",
  inventory: "accessInventory",
  accounts: "accessAccounts",
  reports: "accessReports",
  pos: "accessPos",
  settings: "accessSettings",
};

const getAccountingUserLookup = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  if (!token) {
    return {
      user: null,
      reason: "missing-token" as const,
    };
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
    return {
      user: null,
      reason: "session-expired" as const,
    };
  }

  return {
    user: session.accountingUser,
    reason: null,
  };
});

export async function requireAccountingUser() {
  const { user } = await getAccountingUserLookup();
  return user;
}

export async function requireAuthenticatedAccountingUser() {
  const { user, reason } = await getAccountingUserLookup();

  if (!user) {
    if (reason === "missing-token") {
      redirect("/accounting/login");
    }

    redirect("/accounting/login?reason=session-expired");
  }

  return user;
}

export function getAccountingDefaultPath(user: AccountingUser) {
  if (user.role === "SUPER_ADMIN" || user.accessDashboard) {
    return "/accounting/admin";
  }
  if (user.accessSuppliers) {
    return "/accounting/admin/suppliers";
  }
  if (user.accessCustomers) {
    return "/accounting/admin/customers";
  }
  if (user.accessInventory) {
    return "/accounting/admin/inventory";
  }
  if (user.accessAccounts) {
    return "/accounting/admin/accounts";
  }
  if (user.accessReports) {
    return "/accounting/admin/reports";
  }
  if (user.accessPos) {
    return "/accounting/admin/pos";
  }
  if (user.accessSettings) {
    return "/accounting/admin/settings";
  }
  return "/accounting/login?reason=access-denied";
}

export async function requireAccountingAccess(key: AccountingAccessKey) {
  const user = await requireAuthenticatedAccountingUser();

  if (!hasAccountingAccess(user, key)) {
    redirect(getAccountingDefaultPath(user));
  }

  return user;
}

export function hasAccountingAccess(user: AccountingUser, key: AccountingAccessKey) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }

  return Boolean(user[accessFieldByKey[key]]);
}

export function canAccessAccountingStore(user: AccountingUser, targetStoreId: string | null | undefined) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }
  if (!targetStoreId || !user.storeId) {
    return false;
  }
  return user.storeId === targetStoreId;
}
