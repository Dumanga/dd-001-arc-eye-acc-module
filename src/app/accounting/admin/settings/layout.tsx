import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("settings");
  return children;
}
