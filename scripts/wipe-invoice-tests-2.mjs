// Pre-test cleanup #2 — drops the three invoices we created against the
// previous (now-superseded) invoice posting theory and restores the stock
// they decremented so the next test run starts clean against the corrected
// theory (per-product accounts + weighted-avg cost from GRN history).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const SS_001 = "cmnarg5ft0002tsskhpol5mns";
const ABB_ID = "cmng93cvt0005tskw745tt6vt";

async function main() {
  const before = {
    ss: await prisma.accountingProductStock.findUnique({
      where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
      select: { qtyOnHand: true },
    }),
    abb: await prisma.accountingProductStock.findUnique({
      where: { productId_storeId: { productId: ABB_ID, storeId: KOTTE } },
      select: { qtyOnHand: true },
    }),
    ssGlobal: (
      await prisma.accountingProduct.findUnique({
        where: { id: SS_001 },
        select: { stockOnHand: true },
      })
    )?.stockOnHand,
    abbGlobal: (
      await prisma.accountingProduct.findUnique({
        where: { id: ABB_ID },
        select: { stockOnHand: true },
      })
    )?.stockOnHand,
  };
  console.log("BEFORE:", before);

  // Delete invoice ledger + GL rows + customer ledger rows for the three test invoices
  const targetNumbers = ["INV-2026-0001", "INV-2026-0002", "INV-2026-0003"];
  const invoices = await prisma.accountingInvoice.findMany({
    where: { invoiceNumber: { in: targetNumbers } },
    select: { id: true, invoiceNumber: true },
  });
  if (invoices.length) {
    const invoiceIds = invoices.map((i) => i.id);
    await prisma.accountingJournalEntry.deleteMany({
      where: { documentType: "INV", documentId: { in: invoiceIds } },
    });
    await prisma.accountingCustomerLedgerEntry.deleteMany({
      where: { documentType: "INV", documentId: { in: invoiceIds } },
    });
    await prisma.accountingInvoiceLine.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await prisma.accountingInvoice.deleteMany({
      where: { id: { in: invoiceIds } },
    });
    console.log(`Deleted ${invoices.length} invoice(s) + their ledger rows.`);
  } else {
    console.log("No matching invoices to delete.");
  }

  // Restore stock that those approved invoices decremented:
  //   INV-1: -1 SS-001
  //   INV-2: -1 SS-001
  //   INV-3: -1 SS-001 + -2 ABB
  // Total to add back: SS-001 +3, ABB +2
  await prisma.accountingProductStock.update({
    where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
    data: { qtyOnHand: { increment: 3 } },
  });
  await prisma.accountingProduct.update({
    where: { id: SS_001 },
    data: { stockOnHand: { increment: 3 } },
  });
  await prisma.accountingProductStock.update({
    where: { productId_storeId: { productId: ABB_ID, storeId: KOTTE } },
    data: { qtyOnHand: { increment: 2 } },
  });
  await prisma.accountingProduct.update({
    where: { id: ABB_ID },
    data: { stockOnHand: { increment: 2 } },
  });

  // Reset INV form-id back to 0001
  await prisma.accountingFormIdConfig.updateMany({
    where: { formType: "INV" },
    data: { nextNumber: "0001" },
  });

  const after = {
    ss: await prisma.accountingProductStock.findUnique({
      where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
      select: { qtyOnHand: true },
    }),
    abb: await prisma.accountingProductStock.findUnique({
      where: { productId_storeId: { productId: ABB_ID, storeId: KOTTE } },
      select: { qtyOnHand: true },
    }),
  };
  console.log("AFTER:", after);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
