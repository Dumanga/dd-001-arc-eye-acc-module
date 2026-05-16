import type { ReactNode } from "react";
import { AccountingContentLoader } from "@/components/accounting/accounting-content-loader";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { requireAuthenticatedAccountingUser } from "@/lib/auth/accounting";

export default function AccountingAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AccountingAdminLayoutInner>{children}</AccountingAdminLayoutInner>
  );
}

async function AccountingAdminLayoutInner({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedAccountingUser();
  return (
    <AccountingShell
      currentUser={{
        displayName: user.displayName,
        username: user.username,
        role: user.role,
        profileImageId: user.profileImageId,
        storeId: user.storeId,
        accessDashboard: user.accessDashboard,
        accessSuppliers: user.accessSuppliers,
        accessCustomers: user.accessCustomers,
        accessInventory: user.accessInventory,
        accessAccounts: user.accessAccounts,
        accessReports: user.accessReports,
        accessPos: user.accessPos,
        accessSettings: user.accessSettings,
      }}
    >
      <AccountingContentLoader>{children}</AccountingContentLoader>
    </AccountingShell>
  );
}
