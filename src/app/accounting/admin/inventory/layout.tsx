import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingInventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("inventory");
  return children;
}
