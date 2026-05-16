import currencies from "@/lib/accounting/data/currencies.json";

export const ACCOUNTING_CLIENT_DEFAULT_CURRENCY = "LKR";
export const ACCOUNTING_CLIENT_PAGE_SIZE = 10;
export const ACCOUNTING_CLIENT_TIERS = ["BRONZE", "SILVER", "GOLD"] as const;

export type AccountingClientTier = (typeof ACCOUNTING_CLIENT_TIERS)[number];

export type AccountingClientPayload = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  address: string | null;
  currency: string;
  tier: AccountingClientTier;
  isMerchant: boolean;
  isWalkIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountingClientListPayload = {
  items: AccountingClientPayload[];
  total: number;
  goldCount: number;
  recentCount: number;
  page: number;
  pageSize: number;
};

type CurrencyRecord = { code: string; name: string };

const supportedCurrencyCodes = new Set(
  Object.values(currencies as Record<string, CurrencyRecord>).map((c) => c.code.toUpperCase())
);

export function isSupportedCurrency(code: string) {
  return supportedCurrencyCodes.has(code.toUpperCase());
}

export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return ACCOUNTING_CLIENT_DEFAULT_CURRENCY;
  return supportedCurrencyCodes.has(trimmed) ? trimmed : null;
}

export function normalizeTier(value: unknown): AccountingClientTier | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (ACCOUNTING_CLIENT_TIERS as readonly string[]).includes(upper)
    ? (upper as AccountingClientTier)
    : null;
}

export function normalizeMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

export function normalizeEmail(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed.toLowerCase() };
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOptionalText(value: unknown): string | null {
  const trimmed = normalizeText(value);
  return trimmed ? trimmed : null;
}

type DbClient = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  address: string | null;
  currency: string;
  tier: AccountingClientTier;
  isMerchant: boolean;
  isWalkIn: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeAccountingClient(row: DbClient): AccountingClientPayload {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    currency: row.currency,
    tier: row.tier,
    isMerchant: row.isMerchant,
    isWalkIn: row.isWalkIn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function normalizeIsMerchant(value: unknown): boolean {
  return value === true || value === "true";
}
