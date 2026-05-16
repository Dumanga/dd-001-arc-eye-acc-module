import type { ReactNode } from "react";
import { requireAccountingAccess } from "@/lib/auth/accounting";

export default async function AccountingSuppliersLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccountingAccess("suppliers");
  return children;
}
