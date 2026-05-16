import { prisma } from "@/lib/db";
async function main() {
  const bills = await prisma.accountingPosBill.findMany({
    where: { billNo: { in: ["POS-2026-00021", "POS-2026-00022", "POS-2026-00020"] } },
    select: {
      billNo: true,
      status: true,
      isHeld: true,
      cashierId: true,
      cashier: { select: { displayName: true } },
      lastActivityAt: true,
      createdAt: true,
      cancelledAt: true,
      cancelReason: true,
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log("BILLS:");
  console.log(JSON.stringify(bills, null, 2));
}
main().finally(() => prisma.$disconnect());
