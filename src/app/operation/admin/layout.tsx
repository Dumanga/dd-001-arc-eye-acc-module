import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { prisma } from "@/lib/db";
import { getSessionCookieName, hashSessionToken } from "@/lib/auth/session";

async function requireOperationSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName("OPERATION"))?.value;

  if (!token) {
    redirect("/operation/login");
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

  if (
    !session?.user ||
    (session.user.system !== "OPERATION" && session.user.system !== "BOTH")
  ) {
    redirect("/operation/login");
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireOperationSession();
  return <AdminShell>{children}</AdminShell>;
}
