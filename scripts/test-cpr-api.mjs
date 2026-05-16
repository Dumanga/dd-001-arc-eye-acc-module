import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const receipts = await p.accountingCustomerPaymentReceipt.findMany({
    where: { status: { not: "CANCELLED" } },
    include: {
      customer: { select: { name: true, address: true } },
      store: { select: { id: true, code: true, name: true } },
    },
  });
  console.log("OK", receipts.length, "receipts");
} catch (e) {
  console.error("ERR", e.message);
} finally {
  await p.$disconnect();
}
