import type {
  AccountingJournalDocType,
  Prisma,
} from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type ReverseAccountingTransactionsInput = {
  documentType: AccountingJournalDocType;
  documentId: string;
  createdById: string;
  // Optional override of the narration prefix on the reversal rows. Defaults
  // to "Reversal —" which reads naturally in the GL register.
  narrationPrefix?: string;
};

export type ReverseAccountingTransactionsResult = {
  glEntriesReversed: number;
  supplierLedgerEntriesReversed: number;
  customerLedgerEntriesReversed: number;
};

// Generic GL + sub-ledger reversal helper. Mirrors every existing posting
// row for a given source document with a negated `value`, preserving every
// snapshot column (account, supplier, customer, product, store, etc.). The
// reversal rows carry `reversalOfDocumentId = documentId` so the GL register
// can colour-code them.
//
// Both the originals and reversals stay in the books — that's the audit
// trail. The caller is responsible for flipping the source document's
// status (APPROVED → DRAFT) in the same transaction.
//
// Behaviour notes:
//   - We only mirror rows that aren't themselves reversal rows
//     (reversalOfDocumentId IS NULL). Re-running this on an already-
//     reversed document is a no-op for those original rows but will mirror
//     any fresh approval-posted rows that landed between unapprovals.
//   - If there are no original rows, throws — caller's responsibility to
//     check status before calling.
export async function reverseAccountingTransactions(
  tx: Tx,
  input: ReverseAccountingTransactionsInput
): Promise<ReverseAccountingTransactionsResult> {
  const prefix = (input.narrationPrefix ?? "Reversal").trim();

  const [glOriginals, supplierOriginals, customerOriginals] = await Promise.all([
    tx.accountingJournalEntry.findMany({
      where: {
        documentType: input.documentType,
        documentId: input.documentId,
        reversalOfDocumentId: null,
      },
    }),
    tx.accountingSupplierLedgerEntry.findMany({
      where: {
        documentType: input.documentType,
        documentId: input.documentId,
        reversalOfDocumentId: null,
      },
    }),
    tx.accountingCustomerLedgerEntry.findMany({
      where: {
        documentType: input.documentType,
        documentId: input.documentId,
        reversalOfDocumentId: null,
      },
    }),
  ]);

  if (glOriginals.length === 0) {
    throw new Error(
      `reverseAccountingTransactions: no original GL rows found for ${input.documentType} ${input.documentId}`
    );
  }

  const truncate = (s: string) => s.slice(0, 500);

  const glReversals = glOriginals.map((row) => ({
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    storeId: row.storeId,
    documentType: row.documentType,
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    sourceLineId: row.sourceLineId,
    supplierId: row.supplierId,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    value: row.value.negated(),
    currency: row.currency,
    narration: truncate(`${prefix} — ${row.narration}`),
    reversalOfDocumentId: row.documentId,
    createdById: input.createdById,
  }));

  const supplierReversals = supplierOriginals.map((row) => ({
    supplierId: row.supplierId,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    storeId: row.storeId,
    documentType: row.documentType,
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    value: row.value.negated(),
    currency: row.currency,
    narration: truncate(`${prefix} — ${row.narration}`),
    reversalOfDocumentId: row.documentId,
    createdById: input.createdById,
  }));

  const customerReversals = customerOriginals.map((row) => ({
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    storeId: row.storeId,
    documentType: row.documentType,
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    value: row.value.negated(),
    currency: row.currency,
    narration: truncate(`${prefix} — ${row.narration}`),
    reversalOfDocumentId: row.documentId,
    createdById: input.createdById,
  }));

  if (glReversals.length) {
    await tx.accountingJournalEntry.createMany({ data: glReversals });
  }
  if (supplierReversals.length) {
    await tx.accountingSupplierLedgerEntry.createMany({ data: supplierReversals });
  }
  if (customerReversals.length) {
    await tx.accountingCustomerLedgerEntry.createMany({ data: customerReversals });
  }

  return {
    glEntriesReversed: glReversals.length,
    supplierLedgerEntriesReversed: supplierReversals.length,
    customerLedgerEntriesReversed: customerReversals.length,
  };
}
