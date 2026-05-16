import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const supplier = await prisma.accountingSupplier.findFirst({
  select: { id: true, code: true, name: true },
  orderBy: { createdAt: "asc" },
});
console.log("supplier:", supplier);

const product = await prisma.accountingProduct.findFirst({
  where: { status: "ACTIVE", itemType: "INVENTORY_ITEM", tradeMode: { in: ["BUY", "BOTH"] } },
  select: { id: true, code: true, purchaseName: true, costPrice: true, inventoryAccountId: true },
  orderBy: { createdAt: "asc" },
});
console.log("product:", product);

const cash = await prisma.chartOfAccount.findFirst({
  where: { code: { startsWith: "121" }, isActive: true },
  select: { id: true, code: true, name: true },
  orderBy: { code: "asc" },
});
console.log("cash account:", cash);

const fids = await prisma.accountingFormIdConfig.findMany({
  where: { formType: { in: ["PO", "GRN", "GRR", "PV"] } },
  select: { formType: true, code: true, yearToken: true, nextNumber: true },
});
console.log("form-ids:", fids);

const store = await prisma.store.findFirst({
  where: { code: "MAIN-001" },
  select: { id: true, code: true, name: true },
});
console.log("store:", store);

await prisma.$disconnect();
