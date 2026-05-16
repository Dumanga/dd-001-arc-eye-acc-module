-- Phase 2 + Phase 3 of new-critical-update-plan.md (branch-aware operations).
--
-- Adds `storeId` (FK -> store.id, ON DELETE RESTRICT) on every transactional accounting
-- doc table and every ledger table. Single-step `ADD COLUMN ... NOT NULL` works because
-- the dev DB had these tables wiped first (per the dev rollout in the plan). For a real
-- production run, this would have to be split into nullable -> backfill -> NOT NULL per
-- the phased plan.
--
-- Also reserves `IBT` in the AccountingJournalDocType enum (cost-free now, used in Phase 7).

-- ---------------------------------------------------------------------------
-- AccountingJournalDocType: extend enum to include IBT (Inter-Branch Transfer).
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingjournalentry`
  MODIFY COLUMN `documentType` ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT') NOT NULL;

ALTER TABLE `accountingsupplierledgerentry`
  MODIFY COLUMN `documentType` ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT') NOT NULL;

-- ---------------------------------------------------------------------------
-- accountingpurchaseorder
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingpurchaseorder`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `supplierId`;

CREATE INDEX `accountingpurchaseorder_storeId_idx` ON `accountingpurchaseorder`(`storeId`);

ALTER TABLE `accountingpurchaseorder` ADD CONSTRAINT `accountingpurchaseorder_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountinggoodsreceipt
-- ---------------------------------------------------------------------------
ALTER TABLE `accountinggoodsreceipt`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `supplierId`;

CREATE INDEX `accountinggoodsreceipt_storeId_idx` ON `accountinggoodsreceipt`(`storeId`);

ALTER TABLE `accountinggoodsreceipt` ADD CONSTRAINT `accountinggoodsreceipt_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountinggoodsreturn
-- ---------------------------------------------------------------------------
ALTER TABLE `accountinggoodsreturn`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `supplierId`;

CREATE INDEX `accountinggoodsreturn_storeId_idx` ON `accountinggoodsreturn`(`storeId`);

ALTER TABLE `accountinggoodsreturn` ADD CONSTRAINT `accountinggoodsreturn_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountingpaymentvoucher
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingpaymentvoucher`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `supplierId`;

CREATE INDEX `accountingpaymentvoucher_storeId_idx` ON `accountingpaymentvoucher`(`storeId`);

ALTER TABLE `accountingpaymentvoucher` ADD CONSTRAINT `accountingpaymentvoucher_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountingquotation
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingquotation`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `customerId`;

CREATE INDEX `accountingquotation_storeId_idx` ON `accountingquotation`(`storeId`);

ALTER TABLE `accountingquotation` ADD CONSTRAINT `accountingquotation_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountinginvoice
-- ---------------------------------------------------------------------------
ALTER TABLE `accountinginvoice`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `customerId`;

CREATE INDEX `accountinginvoice_storeId_idx` ON `accountinginvoice`(`storeId`);

ALTER TABLE `accountinginvoice` ADD CONSTRAINT `accountinginvoice_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountingjournalentry: branch-aware GL rows + reporting indexes.
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingjournalentry`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `accountName`;

CREATE INDEX `accountingjournalentry_storeId_documentDate_idx`
  ON `accountingjournalentry`(`storeId`, `documentDate`);

CREATE INDEX `accountingjournalentry_storeId_accountId_documentDate_idx`
  ON `accountingjournalentry`(`storeId`, `accountId`, `documentDate`);

ALTER TABLE `accountingjournalentry` ADD CONSTRAINT `accountingjournalentry_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountingsupplierledgerentry: branch-aware supplier ledger rows + indexes.
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingsupplierledgerentry`
  ADD COLUMN `storeId` VARCHAR(191) NOT NULL AFTER `supplierName`;

CREATE INDEX `accountingsupplierledgerentry_storeId_documentDate_idx`
  ON `accountingsupplierledgerentry`(`storeId`, `documentDate`);

-- Shortened name (full form would exceed MySQL's 64-char identifier limit).
CREATE INDEX `acsupledger_storeId_supplierId_documentDate_idx`
  ON `accountingsupplierledgerentry`(`storeId`, `supplierId`, `documentDate`);

ALTER TABLE `accountingsupplierledgerentry` ADD CONSTRAINT `accountingsupplierledgerentry_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
