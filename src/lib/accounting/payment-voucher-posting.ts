import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";
import { getSystemAccountId } from "@/lib/accounting/system-accounts";

type Tx = Prisma.TransactionClient;

export type PostPaymentVoucherInput = {
  paymentVoucherId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostPaymentVoucherResult = {
  glEntriesWritten: number;
  supplierLedgerEntriesWritten: number;
  paymentTotal: number;
  discountTotal: number;
};

// Posts the accounting transactions for an approved supplier payment voucher
// per accounting-theories.md, sections 2.1 and 2.2.
//
//  - Without discount:
//      pay-from cash account: -payment
//      supplier payable:      -payment
//      supplier ledger:       -payment
//
//  - With discount:
//      pay-from cash account: -payment
//      supplier payable:      -payment
//      supplier ledger:       -payment
//      cash discount income:  +discount
//      supplier payable:      -discount
//      supplier ledger:       -discount
//
// Where payment = sum of allocation.payingAmount and discount =
// sum of allocation.discount.
export async function postPaymentVoucherApproval(
  tx: Tx,
  input: PostPaymentVoucherInput
): Promise<PostPaymentVoucherResult> {
  const voucher = await tx.accountingPaymentVoucher.findUniqueOrThrow({
    where: { id: input.paymentVoucherId },
    select: {
      id: true,
      voucherNumber: true,
      voucherDate: true,
      currency: true,
      supplierId: true,
      storeId: true,
      payFromAccountId: true,
      allocations: {
        select: {
          payingAmount: true,
          discount: true,
        },
      },
    },
  });

  const paymentTotal = voucher.allocations.reduce(
    (sum, line) => sum + Number(line.payingAmount || 0),
    0
  );
  const discountTotal = voucher.allocations.reduce(
    (sum, line) => sum + Number(line.discount || 0),
    0
  );

  if (paymentTotal <= 0 && discountTotal <= 0) {
    throw new Error(
      "postPaymentVoucherApproval: voucher has zero payment and zero discount."
    );
  }

  const supplierPayableAccountId = await getSystemAccountId(
    "SUPPLIER_PAYABLE",
    tx
  );

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  const supplierLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["supplierLedgerEntries"] = [];

  if (paymentTotal > 0) {
    glEntries.push({
      accountId: voucher.payFromAccountId,
      value: -paymentTotal,
      supplierId: voucher.supplierId,
      narration: `Cash payment — ${voucher.voucherNumber}`,
    });
    glEntries.push({
      accountId: supplierPayableAccountId,
      value: -paymentTotal,
      supplierId: voucher.supplierId,
      narration: `Payable settled (cash) — ${voucher.voucherNumber}`,
    });
    supplierLedgerEntries.push({
      supplierId: voucher.supplierId,
      value: -paymentTotal,
      narration: `Payment to supplier — ${voucher.voucherNumber}`,
    });
  }

  if (discountTotal > 0) {
    const cashDiscountIncomeAccountId = await getSystemAccountId(
      "CASH_DISCOUNT_INCOME",
      tx
    );
    glEntries.push({
      accountId: cashDiscountIncomeAccountId,
      value: discountTotal,
      supplierId: voucher.supplierId,
      narration: `Cash discount received — ${voucher.voucherNumber}`,
    });
    glEntries.push({
      accountId: supplierPayableAccountId,
      value: -discountTotal,
      supplierId: voucher.supplierId,
      narration: `Payable settled (discount) — ${voucher.voucherNumber}`,
    });
    supplierLedgerEntries.push({
      supplierId: voucher.supplierId,
      value: -discountTotal,
      narration: `Discount from supplier — ${voucher.voucherNumber}`,
    });
  }

  return postAccountingTransactions(tx, {
    documentType: "PV",
    documentId: voucher.id,
    documentNumber: voucher.voucherNumber,
    documentDate: voucher.voucherDate,
    storeId: voucher.storeId,
    currency: voucher.currency,
    createdById: input.createdById,
    glEntries,
    supplierLedgerEntries,
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    paymentTotal,
    discountTotal,
  }));
}
