import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingAccountsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("accounts");
  return children;
}
