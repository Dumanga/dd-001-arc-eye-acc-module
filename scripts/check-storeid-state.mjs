import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TABLES = [
  "accountingpurchaseorder",
  "accountinggoodsreceipt",
  "accountinggoodsreturn",
  "accountingpaymentvoucher",
  "accountingquotation",
  "accountinginvoice",
  "accountingjournalentry",
  "accountingsupplierledgerentry",
];

const r = await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME, COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'storeId' AND TABLE_NAME IN (${TABLES.map(() => "?").join(",")})
`, ...TABLES);

console.log("Tables that already have storeId:");
for (const row of r) console.log("  ", row.TABLE_NAME);

const fks = await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME, CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'storeId' AND CONSTRAINT_NAME LIKE '%_storeId_fkey'
`);
console.log("\nstoreId FK constraints already in place:");
for (const row of fks) console.log("  ", row.TABLE_NAME, "→", row.CONSTRAINT_NAME);

await prisma.$disconnect();
