import type { AccountingSystemAccountKey, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Maps each system-account key to the chart-of-accounts code that should fill
// it on a fresh install. The codes come from defualt-accounting-setup.md.
export const SYSTEM_ACCOUNT_DEFAULTS: Record<AccountingSystemAccountKey, string> = {
  SUPPLIER_PAYABLE: "LAP001",
  DEBTOR_RECEIVABLE: "AAR001",
  PRODUCTION_INVENTORY: "INVE0001",
  CASH_ON_HAND: "ACCH001",
  SSCL_TAX_PAYABLE: "SSCL0001",
  VAT_PAYABLE: "VATP0001",
  PRODUCT_INCOME: "PRIN0001",
  CASH_DISCOUNT_INCOME: "IOOI001",
  SALES_DISCOUNT_INCOME: "IOOI002",
  COST_OF_GOODS_SOLD: "COGS0001",
  SALES_DISCOUNT_EXPENSE: "EES001",
  CASH_DISCOUNT_EXPENSE: "EOPS001",
};

type Tx = Prisma.TransactionClient | typeof prisma;

// Returns the chartofaccounts.id mapped to the given system-account key.
// Creates the mapping row on first call by looking up the default code.
// Throws if the underlying chart-of-accounts row is missing — fix the seed.
export async function getSystemAccountId(
  key: AccountingSystemAccountKey,
  tx: Tx = prisma
): Promise<string> {
  const existing = await tx.accountingSystemAccount.findUnique({
    where: { key },
    select: { accountId: true },
  });
  if (existing) return existing.accountId;

  const defaultCode = SYSTEM_ACCOUNT_DEFAULTS[key];
  const account = await tx.chartOfAccount.findUnique({
    where: { code: defaultCode },
    select: { id: true },
  });
  if (!account) {
    throw new Error(
      `System account "${key}" cannot be resolved — chart-of-accounts code "${defaultCode}" is missing.`
    );
  }

  const created = await tx.accountingSystemAccount.create({
    data: { key, accountId: account.id },
    select: { accountId: true },
  });
  return created.accountId;
}

// Optional: seeds every system-account row at once. Useful for setup scripts.
export async function ensureSystemAccountsSeeded(): Promise<void> {
  const keys = Object.keys(SYSTEM_ACCOUNT_DEFAULTS) as AccountingSystemAccountKey[];
  for (const key of keys) {
    await getSystemAccountId(key);
  }
}
