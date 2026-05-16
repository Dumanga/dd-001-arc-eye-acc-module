import { prisma } from "@/lib/db";
async function main() {
  const u = await prisma.accountingUser.findUnique({
    where: { id: "cmn1dlzvi0003tsxgegt5jpbg" },
    select: { displayName: true, role: true, storeId: true, accessReports: true },
  });
  console.log(u);
}
main().finally(() => prisma.$disconnect());
