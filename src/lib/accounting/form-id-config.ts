import type { AccountingFormType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Subset of the prisma client surface area we need inside a transaction.
// Lets `consumeFormIdInTx` accept either the global client or a tx handle.
type FormIdTx = Pick<Prisma.TransactionClient, "$queryRawUnsafe" | "accountingFormIdConfig">;

export type FormIdConfigItem = {
  formType: AccountingFormType;
  label: string;
  code: string;
  yearToken: string;
  rangeFrom: string;
  rangeTo: string;
  nextNumber: string;
};

const FORM_TYPE_LABELS: Record<AccountingFormType, string> = {
  PO: "Purchase Orders",
  GRN: "GRN",
  GRR: "Goods Returns",
  QT: "Quotations",
  INV: "Invoices",
  SR: "Customer Returns",
  RC: "Receipts",
  POS: "POS Bills",
  PV: "Supplier Payments",
  EXP: "Expense Vouchers",
  JEV: "Journal Entry Vouchers",
  MIN: "Material Issue Notes",
};

const FORM_TYPE_ORDER: AccountingFormType[] = ["PO", "GRN", "GRR", "QT", "INV", "SR", "RC", "POS", "PV", "EXP", "JEV", "MIN"];

const DEFAULTS: Record<AccountingFormType, Omit<FormIdConfigItem, "label">> = {
  PO:  { formType: "PO",  code: "PO",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  GRN: { formType: "GRN", code: "GRN", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  // GRR uses the friendlier `GR-` prefix on the user-facing number; the
  // internal accounting document type stays GRR.
  GRR: { formType: "GRR", code: "GR",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  QT:  { formType: "QT",  code: "QT",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  INV: { formType: "INV", code: "INV", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  SR:  { formType: "SR",  code: "SR",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  RC:  { formType: "RC",  code: "RC",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  POS: { formType: "POS", code: "POS", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  PV:  { formType: "PV",  code: "PV",  yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  EXP: { formType: "EXP", code: "EXP", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  JEV: { formType: "JEV", code: "JEV", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
  MIN: { formType: "MIN", code: "MIN", yearToken: "2026", rangeFrom: "0001", rangeTo: "9999", nextNumber: "0001" },
};

export async function getFormIdConfigs(): Promise<FormIdConfigItem[]> {
  const rows = await prisma.accountingFormIdConfig.findMany();
  const byType = new Map(rows.map((row) => [row.formType, row]));

  return FORM_TYPE_ORDER.map((formType) => {
    const row = byType.get(formType);
    const defaults = DEFAULTS[formType];

    return {
      formType,
      label: FORM_TYPE_LABELS[formType],
      code: row?.code ?? defaults.code,
      yearToken: row?.yearToken ?? defaults.yearToken,
      rangeFrom: row?.rangeFrom ?? defaults.rangeFrom,
      rangeTo: row?.rangeTo ?? defaults.rangeTo,
      nextNumber: row?.nextNumber ?? defaults.nextNumber,
    };
  });
}

export async function getFormIdConfig(formType: AccountingFormType): Promise<FormIdConfigItem> {
  const row = await prisma.accountingFormIdConfig.findUnique({ where: { formType } });
  const defaults = DEFAULTS[formType];

  return {
    formType,
    label: FORM_TYPE_LABELS[formType],
    code: row?.code ?? defaults.code,
    yearToken: row?.yearToken ?? defaults.yearToken,
    rangeFrom: row?.rangeFrom ?? defaults.rangeFrom,
    rangeTo: row?.rangeTo ?? defaults.rangeTo,
    nextNumber: row?.nextNumber ?? defaults.nextNumber,
  };
}

export function buildFormId(config: Pick<FormIdConfigItem, "code" | "yearToken" | "nextNumber">) {
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(Boolean);
  return parts.join("-");
}

type UpsertInput = {
  formType: AccountingFormType;
  code: string;
  yearToken: string;
  rangeFrom: string;
  rangeTo: string;
  nextNumber: string;
};

// Atomically reads the current `nextNumber` for a form type, increments
// it, and returns the rendered formId for the consumer to stamp onto a
// new document. Must be called inside a Prisma transaction (`tx`) so the
// SELECT … FOR UPDATE row lock is held for the lifetime of the calling
// flow — prevents two concurrent POS bill creates from getting the same
// billNo.
//
// Behaviour around bill-number burning (see pos-integration-flow.md
// § 8.3 / § 8.4): once consumed, a number is **never recycled**. If the
// caller's transaction rolls back, the increment is rolled back too —
// fine. If the caller's transaction commits but later cancels the
// document (e.g. CANCELLED held POS bill), that cancelled row keeps
// its formId on the cancelled record and the next consumer takes the
// next sequential number. Cancellation does NOT call this helper a
// second time.
export async function consumeFormIdInTx(
  tx: FormIdTx,
  formType: AccountingFormType
): Promise<{ formId: string; nextNumber: string; code: string; yearToken: string }> {
  const defaults = DEFAULTS[formType];

  // 1. Lock the existing row (or fall through to the upsert path if
  //    the row was never created — first-ever consumer).
  // FOR UPDATE locks the row for other writers in the same transaction
  // window. Other consumers calling this helper will block until the
  // outer transaction commits or rolls back.
  const locked = (await tx.$queryRawUnsafe<{
    code: string;
    yearToken: string;
    nextNumber: string;
  }[]>(
    `SELECT code, yearToken, nextNumber FROM accountingformidconfig WHERE formType = ? FOR UPDATE`,
    formType
  )) ?? [];

  let code: string;
  let yearToken: string;
  let currentNext: string;

  if (locked.length === 0) {
    // No row yet — create one with the defaults. Note: another concurrent
    // creator might race us here, but the @unique on formType means at
    // most one will win; the loser will throw P2002 and the caller's
    // outer transaction will retry.
    const created = await tx.accountingFormIdConfig.create({
      data: {
        formType,
        code: defaults.code,
        yearToken: defaults.yearToken,
        rangeFrom: defaults.rangeFrom,
        rangeTo: defaults.rangeTo,
        nextNumber: defaults.nextNumber,
      },
      select: { code: true, yearToken: true, nextNumber: true },
    });
    code = created.code;
    yearToken = created.yearToken;
    currentNext = created.nextNumber;
  } else {
    code = locked[0].code;
    yearToken = locked[0].yearToken;
    currentNext = locked[0].nextNumber;
  }

  const formId = buildFormId({ code, yearToken, nextNumber: currentNext });
  const incremented = String(Number(currentNext) + 1).padStart(
    Math.max(4, currentNext.length),
    "0"
  );

  await tx.accountingFormIdConfig.update({
    where: { formType },
    data: { nextNumber: incremented },
  });

  return { formId, nextNumber: incremented, code, yearToken };
}

export async function upsertFormIdConfig(input: UpsertInput): Promise<FormIdConfigItem> {
  const row = await prisma.accountingFormIdConfig.upsert({
    where: { formType: input.formType },
    create: {
      formType: input.formType,
      code: input.code.trim(),
      yearToken: input.yearToken.trim(),
      rangeFrom: input.rangeFrom.trim(),
      rangeTo: input.rangeTo.trim(),
      nextNumber: input.nextNumber.trim(),
    },
    update: {
      code: input.code.trim(),
      yearToken: input.yearToken.trim(),
      rangeFrom: input.rangeFrom.trim(),
      rangeTo: input.rangeTo.trim(),
      nextNumber: input.nextNumber.trim(),
    },
  });

  return {
    formType: row.formType,
    label: FORM_TYPE_LABELS[row.formType],
    code: row.code,
    yearToken: row.yearToken,
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
    nextNumber: row.nextNumber,
  };
}
