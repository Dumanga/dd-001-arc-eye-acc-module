import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingCustomersLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("customers");
  return children;
}
