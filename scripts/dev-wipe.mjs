// Dev-only wipe of operational/transactional accounting tables.
// See new-critical-update-plan.md → "Dev environment rollout — wipe and recreate".
//
// Run:  node scripts/dev-wipe.mjs
// Master tables (suppliers, customers, products, CoA, tax, UOM, users, form-id rows themselves)
// are NEVER touched. Only stockOnHand and form-id nextNumber counters are reset.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = [
  // delete order — children before parents
  "accountingsupplierledgerentry",
  "accountingjournalentry",
  "accountingpaymentvoucherallocation",
  "accountingpaymentvoucher",
  "accountinggoodsreturnline",
  "accountinggoodsreturn",
  "accountinggoodsreceiptlineserial",
  "accountinggoodsreceiptline",
  "accountinggoodsreceipt",
  "accountingpurchaseorderline",
  "accountingpurchaseorder",
  "accountinginvoiceline",
  "accountinginvoice",
  "accountingquotationline",
  "accountingquotation",
];

async function counts(label) {
  console.log(`\n--- counts (${label}) ---`);
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${t}\``);
    console.log(`${t.padEnd(40)} ${r[0].n}`);
  }
  const stock = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS withStock FROM accountingproduct WHERE stockOnHand <> 0`
  );
  console.log(`accountingproduct (rows with stockOnHand<>0)  ${stock[0].withStock}`);
  const fid = await prisma.$queryRawUnsafe(
    `SELECT formType, nextNumber FROM accountingformidconfig WHERE formType IN ('PO','GRN','GRR','PV','QT','INV') ORDER BY formType`
  );
  console.log("accountingformidconfig nextNumber:");
  for (const row of fid) console.log(`  ${row.formType.padEnd(4)} ${row.nextNumber}`);
}

async function main() {
  await counts("before");

  console.log("\n--- wiping ---");
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) {
    const res = await prisma.$executeRawUnsafe(`DELETE FROM \`${t}\``);
    console.log(`deleted from ${t.padEnd(40)} (${res} rows)`);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

  console.log("\n--- resets ---");
  const stockReset = await prisma.$executeRawUnsafe(
    "UPDATE accountingproduct SET stockOnHand = 0 WHERE stockOnHand <> 0"
  );
  console.log(`reset accountingproduct.stockOnHand on ${stockReset} rows`);

  const fidReset = await prisma.$executeRawUnsafe(
    "UPDATE accountingformidconfig SET nextNumber = '0001' WHERE formType IN ('PO','GRN','GRR','PV','QT','INV')"
  );
  console.log(`reset form-id nextNumber on ${fidReset} rows`);

  await counts("after");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
