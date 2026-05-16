import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";
import { getWeightedAvgCost } from "@/lib/accounting/invoice-posting";
import { consumeProductStock } from "@/lib/accounting/product-stock";

type Tx = Prisma.TransactionClient;

export type PostMaterialIssueInput = {
  materialIssueId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostMaterialIssueResult = {
  glEntriesWritten: number;
  total: number;
};

// Posts the accounting transactions for an approved Material Issue Note per
// accounting-theories.md §10.
//
//   Step 1 — per-line credit to each product's inventory account at
//     `qty × weighted-average cost from GRN history`. Same WAC source as
//     POS / Invoice COGS so cost recognition stays consistent across every
//     "stock-out" path.
//   Step 2 — single debit to the header expense account for the total.
//
// Also decrements the branch stock for each line (analogous to how POS bill
// completion / Invoice approval decrement stock). The branch's qtyOnHand
// must already have headroom — the create-draft API guards against
// insufficient stock at submission time.
//
// No supplier / customer sub-ledger — internal consumption has no
// counterparty.
export async function postMaterialIssueApproval(
  tx: Tx,
  input: PostMaterialIssueInput
): Promise<PostMaterialIssueResult> {
  const issue = await tx.accountingMaterialIssue.findUniqueOrThrow({
    where: { id: input.materialIssueId },
    select: {
      id: true,
      issueNumber: true,
      issueDate: true,
      currency: true,
      storeId: true,
      expenseAccountId: true,
      lines: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          notes: true,
          itemName: true,
          product: {
            select: {
              itemType: true,
              inventoryAccountId: true,
              code: true,
            },
          },
        },
        orderBy: { lineOrder: "asc" },
      },
    },
  });

  if (issue.lines.length === 0) {
    throw new Error(
      `Material issue ${issue.issueNumber} has no lines — cannot post.`
    );
  }

  // Resolve a fallback inventory account in case any product is missing the
  // mapping (mirrors the GRN-approve fallback to PRODUCTION_INVENTORY).
  const { getSystemAccountId } = await import("@/lib/accounting/system-accounts");
  const fallbackInventoryAccountId = await getSystemAccountId(
    "PRODUCTION_INVENTORY",
    tx
  );

  // ── Step 0: resolve WAC + decrement stock per line ──────────────────
  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let total = 0;
  const lineUpdates: Array<{ id: string; unitCost: number; lineValue: number }> = [];

  for (const line of issue.lines) {
    if (line.product.itemType !== "INVENTORY_ITEM") {
      // Service items have no stock and no inventory account — they should
      // never reach the material issue picker, but reject defensively.
      throw new Error(
        `Material issue ${issue.issueNumber} line "${line.itemName}" is not an inventory item.`
      );
    }

    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(
        `Material issue ${issue.issueNumber} line "${line.itemName}" has invalid quantity ${qty}.`
      );
    }

    const wac = await getWeightedAvgCost(tx, line.productId);
    if (wac <= 0) {
      throw new Error(
        `MIN_NO_COST_BASIS:No GRN cost history exists for "${line.product.code}". Receive stock first.`
      );
    }

    const lineValue = qty * wac;
    total += lineValue;
    lineUpdates.push({ id: line.id, unitCost: wac, lineValue });

    // Decrement branch stock atomically. Returns false on insufficient
    // stock (same helper POS uses).
    const ok = await consumeProductStock(tx, {
      productId: line.productId,
      storeId: issue.storeId,
      qty,
    });
    if (!ok) {
      throw new Error(
        `INSUFFICIENT_STOCK:"${line.product.code}" — branch stock dropped below the issued quantity.`
      );
    }

    // Per-line inventory credit. Signed value is -lineValue because the
    // asset (inventory) is debit-normal and we're shrinking it.
    glEntries.push({
      accountId: line.product.inventoryAccountId ?? fallbackInventoryAccountId,
      value: -lineValue,
      productId: line.productId,
      sourceLineId: line.id,
      narration: `Material issued — ${line.itemName}`,
    });
  }

  // ── Step 2: header expense debit (one row) ──────────────────────────
  glEntries.push({
    accountId: issue.expenseAccountId,
    value: total,
    narration: `Materials issued — ${issue.issueNumber}`,
  });

  // ── Snapshot the resolved WAC + line values onto the line rows so the
  //    preview / reports can render them without re-computing ─────────
  for (const u of lineUpdates) {
    await tx.accountingMaterialIssueLine.update({
      where: { id: u.id },
      data: {
        unitCost: new PrismaNS.Decimal(u.unitCost.toFixed(4)),
        lineValue: new PrismaNS.Decimal(u.lineValue.toFixed(4)),
      },
    });
  }
  await tx.accountingMaterialIssue.update({
    where: { id: issue.id },
    data: { total: new PrismaNS.Decimal(total.toFixed(4)) },
  });

  const result = await postAccountingTransactions(tx, {
    documentType: "MIN",
    documentId: issue.id,
    documentNumber: issue.issueNumber,
    documentDate: issue.issueDate,
    storeId: issue.storeId,
    currency: issue.currency,
    createdById: input.createdById,
    glEntries,
    allowExisting: input.allowExisting ?? false,
  });

  return {
    glEntriesWritten: result.glEntriesWritten,
    total,
  };
}
