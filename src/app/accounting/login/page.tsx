import { redirect } from "next/navigation";
import { AccountingLoginForm } from "@/components/accounting/accounting-login-form";
import { getAccountingDefaultPath, requireAccountingUser } from "@/lib/auth/accounting";

export default async function AccountingLoginPage() {
  const user = await requireAccountingUser();

  if (user) {
    redirect(getAccountingDefaultPath(user));
  }

  return <AccountingLoginForm />;
}
