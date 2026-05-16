import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAccountingAccess } from "@/lib/auth/accounting";
import { POS_ENABLED } from "@/lib/accounting/feature-flags";

export default async function AccountingPosLayout({
  children,
}: {
  children: ReactNode;
}) {
  // POS is gated by a feature flag — when disabled the entire surface is
  // hidden in the UI, and direct URL access falls back to the dashboard.
  // The route, components, API, and posting code all still exist so the
  // flag can be flipped back on without code archeology.
  if (!POS_ENABLED) {
    redirect("/accounting/admin");
  }
  await requireAccountingAccess("pos");
  return children;
}
