import type { Prisma } from "@prisma/client";

// Per-branch stock helpers. Every flow that mutates stock-on-hand
// (GRN approve, goods-return approve, invoice approve, future POS,
// future IBT) goes through these so:
//   - the per-branch `accountingproductstock(productId, storeId)` row
//     is the source of truth; and
//   - the legacy global `accountingproduct.stockOnHand` counter is kept
//     in sync as a fallback during the rollout window. Once nothing
//     reads the legacy column, this dual-write goes away.

type Tx = Prisma.TransactionClient;

// GRN approve / inbound IBT use this. No minimum-qty check — qty must be
// validated upstream (caller decides what's allowed). Upserts the row if
// it doesn't yet exist for this branch.
export async function incrementProductStock(
  tx: Tx,
  args: { productId: string; storeId: string; qty: number }
): Promise<void> {
  await tx.accountingProductStock.upsert({
    where: { productId_storeId: { productId: args.productId, storeId: args.storeId } },
    update: { qtyOnHand: { increment: args.qty } },
    create: { productId: args.productId, storeId: args.storeId, qtyOnHand: args.qty },
  });
  await tx.accountingProduct.update({
    where: { id: args.productId },
    data: { stockOnHand: { increment: args.qty } },
  });
}

// Goods-return approve uses this. Caller has already validated returnQty
// against the source GRN line so it cannot push stock negative.
export async function decrementProductStock(
  tx: Tx,
  args: { productId: string; storeId: string; qty: number }
): Promise<void> {
  await tx.accountingProductStock.upsert({
    where: { productId_storeId: { productId: args.productId, storeId: args.storeId } },
    update: { qtyOnHand: { decrement: args.qty } },
    create: { productId: args.productId, storeId: args.storeId, qtyOnHand: -args.qty },
  });
  await tx.accountingProduct.update({
    where: { id: args.productId },
    data: { stockOnHand: { decrement: args.qty } },
  });
}

// Invoice approve / future POS sale use this. Atomic check-and-decrement
// against the branch's row — returns true on success, false if branch
// stock is insufficient. The legacy global counter is only decremented
// when the per-branch decrement succeeds, so the two stay in sync.
export async function consumeProductStock(
  tx: Tx,
  args: { productId: string; storeId: string; qty: number }
): Promise<boolean> {
  await tx.accountingProductStock.upsert({
    where: { productId_storeId: { productId: args.productId, storeId: args.storeId } },
    update: {},
    create: { productId: args.productId, storeId: args.storeId, qtyOnHand: 0 },
  });
  const updated = await tx.accountingProductStock.updateMany({
    where: {
      productId: args.productId,
      storeId: args.storeId,
      qtyOnHand: { gte: args.qty },
    },
    data: { qtyOnHand: { decrement: args.qty } },
  });
  if (updated.count !== 1) return false;
  await tx.accountingProduct.update({
    where: { id: args.productId },
    data: { stockOnHand: { decrement: args.qty } },
  });
  return true;
}

// Read per-branch on-hand for a product. Returns 0 if no row exists yet
// (i.e. nothing has ever been received at this branch). Accepts either
// the global Prisma client or a transaction client.
type StockReader = Pick<Tx, "accountingProductStock">;

export async function readBranchStock(
  client: StockReader,
  args: { productId: string; storeId: string }
): Promise<number> {
  const row = await client.accountingProductStock.findUnique({
    where: { productId_storeId: { productId: args.productId, storeId: args.storeId } },
    select: { qtyOnHand: true },
  });
  return row ? Number(row.qtyOnHand) : 0;
}
