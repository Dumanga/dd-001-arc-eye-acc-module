import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("reports");
  return children;
}
