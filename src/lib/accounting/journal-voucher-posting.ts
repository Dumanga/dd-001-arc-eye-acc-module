import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostJournalVoucherInput = {
  journalVoucherId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostJournalVoucherResult = {
  glEntriesWritten: number;
  total: number;
};

// Account categories whose natural balance grows on the debit side. Used to
// decide the sign of the stored journal entry `value` per the additive
// convention (see accounting-theories.md §9 "Signed Value Per Line").
//   - debit-normal (ASSET, EXPENSES): Dr placement = +amount, Cr = -amount
//   - credit-normal (LIABILITIES, EQUITY, INCOME): Cr placement = +amount,
//     Dr placement = -amount
const DEBIT_NORMAL = new Set(["ASSET", "EXPENSES"]);

// Posts the accounting transactions for a posted Journal Entry Voucher per
// accounting-theories.md §9.
//
// One row per line. All rows carry the same (documentType="JEV",
// documentNumber=voucher.voucherNumber, documentId=voucher.id), so the
// journal-entries report can group them under a single JE# header.
//
// No supplier or customer sub-ledger involvement — JEV is a pure GL tool.
//
// The voucher must already be balanced (∑Dr = ∑Cr) — the API guards this
// at create time and posting just forwards the rows. We re-assert
// balance here as a defensive check.
export async function postJournalVoucherApproval(
  tx: Tx,
  input: PostJournalVoucherInput
): Promise<PostJournalVoucherResult> {
  const voucher = await tx.accountingJournalVoucher.findUniqueOrThrow({
    where: { id: input.journalVoucherId },
    select: {
      id: true,
      voucherNumber: true,
      entryDate: true,
      currency: true,
      storeId: true,
      description: true,
      lines: {
        select: {
          id: true,
          accountId: true,
          debitAmount: true,
          creditAmount: true,
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

  if (voucher.lines.length < 2) {
    throw new Error(
      `Journal voucher ${voucher.voucherNumber} must have at least two lines.`
    );
  }

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let totalDr = 0;
  let totalCr = 0;

  for (const line of voucher.lines) {
    const dr = Number(line.debitAmount);
    const cr = Number(line.creditAmount);
    if (!Number.isFinite(dr) || !Number.isFinite(cr) || dr < 0 || cr < 0) {
      throw new Error(
        `Journal voucher ${voucher.voucherNumber} line has invalid amounts (Dr=${dr}, Cr=${cr}).`
      );
    }
    // Exactly one side must be > 0 (§9: "user enters one side only per line").
    if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
      throw new Error(
        `Journal voucher ${voucher.voucherNumber} line must have exactly one of Dr or Cr > 0.`
      );
    }

    const categoryCode = line.account.type.category.code;
    const isDebitNormal = DEBIT_NORMAL.has(categoryCode);

    let signedValue: number;
    if (dr > 0) {
      // Line is on the Dr side: debit-normal grows (+), credit-normal shrinks (−).
      signedValue = isDebitNormal ? dr : -dr;
      totalDr += dr;
    } else {
      // Line is on the Cr side: debit-normal shrinks (−), credit-normal grows (+).
      signedValue = isDebitNormal ? -cr : cr;
      totalCr += cr;
    }

    glEntries.push({
      accountId: line.accountId,
      value: signedValue,
      sourceLineId: line.id,
      narration: line.memo || voucher.description || `JEV ${voucher.voucherNumber}`,
    });
  }

  // Defensive balance re-check — UI and API have both validated this, but
  // any drift here means the GL would unbalance, so it's worth one more
  // assertion right at the posting boundary.
  if (Math.abs(totalDr - totalCr) > 0.005) {
    throw new Error(
      `Journal voucher ${voucher.voucherNumber} is unbalanced: Dr=${totalDr.toFixed(2)} Cr=${totalCr.toFixed(2)}.`
    );
  }

  const result = await postAccountingTransactions(tx, {
    documentType: "JEV",
    documentId: voucher.id,
    documentNumber: voucher.voucherNumber,
    documentDate: voucher.entryDate,
    storeId: voucher.storeId,
    currency: voucher.currency,
    createdById: input.createdById,
    glEntries,
    allowExisting: input.allowExisting ?? false,
  });

  return {
    glEntriesWritten: result.glEntriesWritten,
    total: totalDr, // = totalCr (balanced)
  };
}
