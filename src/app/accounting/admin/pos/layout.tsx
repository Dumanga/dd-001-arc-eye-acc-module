import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingPosLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("pos");
  return children;
}
