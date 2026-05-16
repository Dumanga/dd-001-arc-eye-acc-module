import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostExpenseVoucherInput = {
  expenseVoucherId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostExpenseVoucherResult = {
  glEntriesWritten: number;
  total: number;
};

// Category codes used to drive the additive-convention sign per
// accounting-theories.md §8 "Signed Value Per Line".
//   - debit-normal (ASSET, EXPENSES): debit grows them → value > 0
//   - credit-normal (LIABILITIES, EQUITY, INCOME): debit shrinks them → value < 0
const DEBIT_NORMAL = new Set(["ASSET", "EXPENSES"]);

// Posts the accounting transactions for an approved Expense Voucher per
// accounting-theories.md §8.
//
//   Step 1 — per-line debits: one GL row per voucher line, signed by the
//     line account's natural balance (debit-normal = +amount, credit-normal
//     = -amount). All lines are conceptually on the Dr side regardless of
//     the account category.
//
//   Step 2 — pay-from credit: a single GL row to the pay-from cash/bank
//     account. Cash is debit-normal (ASSET), and we're crediting it, so the
//     signed value is -total (cash asset shrinks).
//
//   Cash leg memo: single-line voucher copies the line memo; multi-line
//     voucher uses "Split — <voucherNumber>".
//
// There is no supplier or customer sub-ledger involvement — pay-from is a
// plain GL cash account.
export async function postExpenseVoucherApproval(
  tx: Tx,
  input: PostExpenseVoucherInput
): Promise<PostExpenseVoucherResult> {
  const voucher = await tx.accountingExpenseVoucher.findUniqueOrThrow({
    where: { id: input.expenseVoucherId },
    select: {
      id: true,
      voucherNumber: true,
      voucherDate: true,
      currency: true,
      storeId: true,
      payFromAccountId: true,
      lines: {
        select: {
          id: true,
          accountId: true,
          amount: true,
          memo: true,
          account: {
            select: {
              type: { select: { category: { select: { code: true } } } },
            },
          },
        },
        orderBy: { lineOrder: "asc" },
      },
    },
  });

  if (voucher.lines.length === 0) {
    throw new Error(
      `Expense voucher ${voucher.voucherNumber} has no lines — cannot post.`
    );
  }

  // ── Step 1: per-line debit rows ──────────────────────────────────────
  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let total = 0;

  for (const line of voucher.lines) {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        `Expense voucher ${voucher.voucherNumber} line has invalid amount ${line.amount}.`
      );
    }
    total += amount;

    const categoryCode = line.account.type.category.code;
    const signedValue = DEBIT_NORMAL.has(categoryCode) ? amount : -amount;

    glEntries.push({
      accountId: line.accountId,
      value: signedValue,
      sourceLineId: line.id,
      narration: line.memo || `Expense voucher line — ${voucher.voucherNumber}`,
    });
  }

  // ── Step 2: pay-from cash/bank credit row ────────────────────────────
  // Cash is debit-normal (ASSET) and we credit it, so the signed value
  // is -total. Memo follows the single-line-copy / multi-line-split rule.
  const cashMemo =
    voucher.lines.length === 1
      ? voucher.lines[0].memo || `Expense voucher — ${voucher.voucherNumber}`
      : `Split — ${voucher.voucherNumber}`;

  glEntries.push({
    accountId: voucher.payFromAccountId,
    value: -total,
    narration: cashMemo,
  });

  const result = await postAccountingTransactions(tx, {
    documentType: "EXP",
    documentId: voucher.id,
    documentNumber: voucher.voucherNumber,
    documentDate: voucher.voucherDate,
    storeId: voucher.storeId,
    currency: voucher.currency,
    createdById: input.createdById,
    glEntries,
    allowExisting: input.allowExisting ?? false,
  });

  return {
    glEntriesWritten: result.glEntriesWritten,
    total,
  };
}
