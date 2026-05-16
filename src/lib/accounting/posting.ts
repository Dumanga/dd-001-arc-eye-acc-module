import type {
  AccountingJournalDocType,
  Prisma,
} from "@prisma/client";

// Sign convention from accounting-theories.md:
//   positive value = adds value to the account/ledger
//   negative value = reduces value from the account/ledger

type Tx = Prisma.TransactionClient;

export type GlEntryInput = {
  accountId: string;
  value: number; // signed
  supplierId?: string | null;
  customerId?: string | null;
  productId?: string | null;
  sourceLineId?: string | null;
  narration?: string;
};

export type SupplierLedgerEntryInput = {
  supplierId: string;
  value: number; // signed
  narration?: string;
};

export type CustomerLedgerEntryInput = {
  customerId: string;
  value: number; // signed
  narration?: string;
};

export type PostAccountingTransactionsInput = {
  documentType: AccountingJournalDocType;
  documentId: string;
  documentNumber: string;
  documentDate: Date;
  // Branch (Store) the source document belongs to. Snapshotted at write time
  // onto every GL row + supplier-ledger row produced by this call. Required —
  // see new-critical-update-plan.md (branch-aware operations).
  storeId: string;
  currency: string;
  createdById: string;
  glEntries: GlEntryInput[];
  supplierLedgerEntries?: SupplierLedgerEntryInput[];
  customerLedgerEntries?: CustomerLedgerEntryInput[];
  // When set, this posting is a reversal of an earlier document.
  reversalOfDocumentId?: string | null;
  // Set true to allow re-posting (e.g. backfill for already-approved docs that
  // somehow don't yet have ledger rows). Default false guards against double
  // posting from buggy callers.
  allowExisting?: boolean;
};

export type PostAccountingTransactionsResult = {
  glEntriesWritten: number;
  supplierLedgerEntriesWritten: number;
  customerLedgerEntriesWritten: number;
};

// Writes both ledgers for a single source document inside the caller's
// transaction. Throws if (documentType, documentId) already has rows in the
// journal table — guards against double posting.
export async function postAccountingTransactions(
  tx: Tx,
  input: PostAccountingTransactionsInput
): Promise<PostAccountingTransactionsResult> {
  if (!input.glEntries.length) {
    throw new Error("postAccountingTransactions: glEntries cannot be empty.");
  }

  if (!input.allowExisting) {
    const existing = await tx.accountingJournalEntry.findFirst({
      where: { documentType: input.documentType, documentId: input.documentId },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `postAccountingTransactions: ledger already has rows for ${input.documentType} ${input.documentId}`
      );
    }
  }

  // Resolve account snapshots in one round-trip
  const accountIds = Array.from(new Set(input.glEntries.map((e) => e.accountId)));
  const accounts = await tx.chartOfAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, code: true, name: true },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  for (const id of accountIds) {
    if (!accountById.has(id)) {
      throw new Error(`postAccountingTransactions: account ${id} not found`);
    }
  }

  // Resolve supplier snapshots
  const supplierIds = Array.from(
    new Set(
      [
        ...input.glEntries.map((e) => e.supplierId).filter(Boolean),
        ...(input.supplierLedgerEntries ?? []).map((e) => e.supplierId),
      ] as string[]
    )
  );
  const supplierById = new Map<string, { code: string; name: string }>();
  if (supplierIds.length) {
    const suppliers = await tx.accountingSupplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, code: true, name: true },
    });
    for (const s of suppliers) supplierById.set(s.id, { code: s.code, name: s.name });
    for (const id of supplierIds) {
      if (!supplierById.has(id)) {
        throw new Error(`postAccountingTransactions: supplier ${id} not found`);
      }
    }
  }

  // Resolve customer snapshots — mirror of suppliers, used by invoice / RC / SR
  const customerIds = Array.from(
    new Set(
      [
        ...input.glEntries.map((e) => e.customerId).filter(Boolean),
        ...(input.customerLedgerEntries ?? []).map((e) => e.customerId),
      ] as string[]
    )
  );
  const customerById = new Map<string, { code: string; name: string }>();
  if (customerIds.length) {
    const customers = await tx.accountingClient.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, mobile: true, name: true },
    });
    for (const c of customers) {
      // AccountingClient has no `code` column today — use mobile as the
      // stable customer identifier snapshot. If a future schema adds a
      // dedicated code field, swap this in.
      customerById.set(c.id, { code: c.mobile, name: c.name });
    }
    for (const id of customerIds) {
      if (!customerById.has(id)) {
        throw new Error(`postAccountingTransactions: customer ${id} not found`);
      }
    }
  }

  // Resolve product snapshots
  const productIds = Array.from(
    new Set(input.glEntries.map((e) => e.productId).filter(Boolean) as string[])
  );
  const productById = new Map<string, { code: string; name: string }>();
  if (productIds.length) {
    const products = await tx.accountingProduct.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true, purchaseName: true, salesName: true },
    });
    for (const p of products) {
      productById.set(p.id, {
        code: p.code,
        name: p.purchaseName ?? p.salesName ?? p.code,
      });
    }
    for (const id of productIds) {
      if (!productById.has(id)) {
        throw new Error(`postAccountingTransactions: product ${id} not found`);
      }
    }
  }

  // Write GL entries
  const glRows = input.glEntries.map((entry) => {
    const account = accountById.get(entry.accountId)!;
    const supplier = entry.supplierId ? supplierById.get(entry.supplierId) ?? null : null;
    const customer = entry.customerId ? customerById.get(entry.customerId) ?? null : null;
    const product = entry.productId ? productById.get(entry.productId) ?? null : null;
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      storeId: input.storeId,
      documentType: input.documentType,
      documentId: input.documentId,
      documentNumber: input.documentNumber,
      documentDate: input.documentDate,
      sourceLineId: entry.sourceLineId ?? null,
      supplierId: entry.supplierId ?? null,
      supplierCode: supplier?.code ?? null,
      supplierName: supplier?.name ?? null,
      customerId: entry.customerId ?? null,
      customerCode: customer?.code ?? null,
      customerName: customer?.name ?? null,
      productId: entry.productId ?? null,
      productCode: product?.code ?? null,
      productName: product?.name ?? null,
      value: entry.value,
      currency: input.currency,
      narration: (entry.narration ?? "").slice(0, 500),
      reversalOfDocumentId: input.reversalOfDocumentId ?? null,
      createdById: input.createdById,
    };
  });

  await tx.accountingJournalEntry.createMany({ data: glRows });

  // Write supplier ledger entries
  let supplierLedgerCount = 0;
  if (input.supplierLedgerEntries?.length) {
    const ledgerRows = input.supplierLedgerEntries.map((entry) => {
      const supplier = supplierById.get(entry.supplierId)!;
      return {
        supplierId: entry.supplierId,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        storeId: input.storeId,
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        value: entry.value,
        currency: input.currency,
        narration: (entry.narration ?? "").slice(0, 500),
        reversalOfDocumentId: input.reversalOfDocumentId ?? null,
        createdById: input.createdById,
      };
    });
    await tx.accountingSupplierLedgerEntry.createMany({ data: ledgerRows });
    supplierLedgerCount = ledgerRows.length;
  }

  // Write customer ledger entries
  let customerLedgerCount = 0;
  if (input.customerLedgerEntries?.length) {
    const customerLedgerRows = input.customerLedgerEntries.map((entry) => {
      const customer = customerById.get(entry.customerId)!;
      return {
        customerId: entry.customerId,
        customerCode: customer.code,
        customerName: customer.name,
        storeId: input.storeId,
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        value: entry.value,
        currency: input.currency,
        narration: (entry.narration ?? "").slice(0, 500),
        reversalOfDocumentId: input.reversalOfDocumentId ?? null,
        createdById: input.createdById,
      };
    });
    await tx.accountingCustomerLedgerEntry.createMany({ data: customerLedgerRows });
    customerLedgerCount = customerLedgerRows.length;
  }

  return {
    glEntriesWritten: glRows.length,
    supplierLedgerEntriesWritten: supplierLedgerCount,
    customerLedgerEntriesWritten: customerLedgerCount,
  };
}
