-- One-shot fixup for the dev DB: the 2026-05-15 migration partially applied
-- (failed at one over-long index name). All other tables succeeded; only the
-- supplierledger 3-column index and FK were left behind. This brings the dev
-- DB to the state a fresh `prisma db execute` of the migration would produce.

CREATE INDEX `acsupledger_storeId_supplierId_documentDate_idx`
  ON `accountingsupplierledgerentry`(`storeId`, `supplierId`, `documentDate`);

ALTER TABLE `accountingsupplierledgerentry` ADD CONSTRAINT `accountingsupplierledgerentry_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
