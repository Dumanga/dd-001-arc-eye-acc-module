import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionCookieName, hashSessionToken } from "@/lib/auth/session";

export type OperationAccessKey =
  | "dashboard"
  | "repairs"
  | "clients"
  | "brands"
  | "users"
  | "stores"
  | "sms"
  | "settings";

const accessFieldByKey: Record<OperationAccessKey, keyof User> = {
  dashboard: "accessDashboard",
  repairs: "accessRepairs",
  clients: "accessClients",
  brands: "accessBrands",
  users: "accessUsers",
  stores: "accessStores",
  sms: "accessSms",
  settings: "accessSettings",
};

export async function requireOperationUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName("OPERATION"))?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
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
    return null;
  }

  if (session.user.system !== "OPERATION" && session.user.system !== "BOTH") {
    return null;
  }

  return session.user;
}

export function hasOperationAccess(user: User, key: OperationAccessKey) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }
  return Boolean(user[accessFieldByKey[key]]);
}

export function canAccessStore(user: User, targetStoreId: string | null | undefined) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }
  if (!targetStoreId || !user.storeId) {
    return false;
  }
  return user.storeId === targetStoreId;
}
