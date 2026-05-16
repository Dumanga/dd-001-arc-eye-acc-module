import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";
import { getSystemAccountId } from "@/lib/accounting/system-accounts";

type Tx = Prisma.TransactionClient;

export type PostCustomerPaymentReceiptInput = {
  customerPaymentReceiptId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostCustomerPaymentReceiptResult = {
  glEntriesWritten: number;
  customerLedgerEntriesWritten: number;
  receivingTotal: number;
  discountTotal: number;
};

// Posts the accounting transactions for an approved customer payment receipt
// per accounting-theories.md, sections 5.1 and 5.2.
//
//  - Without discount:
//      receive-to cash account: +receiving
//      debtor receivable:       -receiving
//      customer ledger:         -receiving
//
//  - With discount (additional rows on top):
//      receive-to cash account: +receiving
//      debtor receivable:       -receiving
//      customer ledger:         -receiving
//      cash discount expense:   +discount
//      debtor receivable:       -discount
//      customer ledger:         -discount
//
// Where receiving = sum of allocation.receivingAmount and discount =
// sum of allocation.discount.
export async function postCustomerPaymentReceiptApproval(
  tx: Tx,
  input: PostCustomerPaymentReceiptInput,
): Promise<PostCustomerPaymentReceiptResult> {
  const receipt = await tx.accountingCustomerPaymentReceipt.findUniqueOrThrow({
    where: { id: input.customerPaymentReceiptId },
    select: {
      id: true,
      receiptNumber: true,
      receiptDate: true,
      currency: true,
      customerId: true,
      storeId: true,
      receiveToAccountId: true,
      allocations: {
        select: {
          receivingAmount: true,
          discount: true,
        },
      },
    },
  });

  const receivingTotal = receipt.allocations.reduce(
    (sum, line) => sum + Number(line.receivingAmount || 0),
    0,
  );
  const discountTotal = receipt.allocations.reduce(
    (sum, line) => sum + Number(line.discount || 0),
    0,
  );

  if (receivingTotal <= 0 && discountTotal <= 0) {
    throw new Error(
      "postCustomerPaymentReceiptApproval: receipt has zero receiving and zero discount.",
    );
  }

  const debtorReceivableAccountId = await getSystemAccountId(
    "DEBTOR_RECEIVABLE",
    tx,
  );

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  const customerLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["customerLedgerEntries"] = [];

  if (receivingTotal > 0) {
    glEntries.push({
      accountId: receipt.receiveToAccountId,
      value: receivingTotal,
      customerId: receipt.customerId,
      narration: `Cash receipt — ${receipt.receiptNumber}`,
    });
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -receivingTotal,
      customerId: receipt.customerId,
      narration: `Receivable settled (cash) — ${receipt.receiptNumber}`,
    });
    customerLedgerEntries.push({
      customerId: receipt.customerId,
      value: -receivingTotal,
      narration: `Payment from customer — ${receipt.receiptNumber}`,
    });
  }

  if (discountTotal > 0) {
    const cashDiscountExpenseAccountId = await getSystemAccountId(
      "CASH_DISCOUNT_EXPENSE",
      tx,
    );
    glEntries.push({
      accountId: cashDiscountExpenseAccountId,
      value: discountTotal,
      customerId: receipt.customerId,
      narration: `Cash discount granted — ${receipt.receiptNumber}`,
    });
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -discountTotal,
      customerId: receipt.customerId,
      narration: `Receivable settled (discount) — ${receipt.receiptNumber}`,
    });
    customerLedgerEntries.push({
      customerId: receipt.customerId,
      value: -discountTotal,
      narration: `Discount granted to customer — ${receipt.receiptNumber}`,
    });
  }

  return postAccountingTransactions(tx, {
    documentType: "RC",
    documentId: receipt.id,
    documentNumber: receipt.receiptNumber,
    documentDate: receipt.receiptDate,
    storeId: receipt.storeId,
    currency: receipt.currency,
    createdById: input.createdById,
    glEntries,
    customerLedgerEntries,
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    receivingTotal,
    discountTotal,
  }));
}
