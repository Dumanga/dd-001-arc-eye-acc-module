-- Phase 6 (invoice flow completion).
--
-- Adds the customer-side mirror of accountingsupplierledgerentry, plus the
-- four system-account mappings invoice approval needs:
--   DEBTOR_RECEIVABLE        → AAR001    DEBTOR RECEIVABLE
--   PRODUCT_INCOME           → PRIN0001  PRODUCT INCOME
--   COST_OF_GOODS_SOLD       → COGS0001  COST OF GOODS SALES
--   SALES_DISCOUNT_EXPENSE   → EES001    SALES DISCOUNT
--
-- See accounting-theories.md § 4 (Invoice Approval Scenario) for the row pattern.

-- ---------------------------------------------------------------------------
-- accountingcustomerledgerentry — customer sub-ledger
-- ---------------------------------------------------------------------------
CREATE TABLE `accountingcustomerledgerentry` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `customerCode` VARCHAR(50) NOT NULL,
    `customerName` VARCHAR(200) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `documentType` ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT') NOT NULL,
    `documentId` VARCHAR(100) NOT NULL,
    `documentNumber` VARCHAR(50) NOT NULL,
    `documentDate` DATE NOT NULL,
    `value` DECIMAL(18,4) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `narration` VARCHAR(500) NOT NULL DEFAULT '',
    `reversalOfDocumentId` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingcustomerledgerentry_customerId_documentDate_idx`(`customerId`, `documentDate`),
    INDEX `accountingcustomerledgerentry_documentType_documentNumber_idx`(`documentType`, `documentNumber`),
    INDEX `accountingcustomerledgerentry_documentType_documentId_idx`(`documentType`, `documentId`),
    INDEX `accustledger_storeId_documentDate_idx`(`storeId`, `documentDate`),
    INDEX `accustledger_storeId_customerId_documentDate_idx`(`storeId`, `customerId`, `documentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingcustomerledgerentry` ADD CONSTRAINT `accountingcustomerledgerentry_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerledgerentry` ADD CONSTRAINT `accountingcustomerledgerentry_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerledgerentry` ADD CONSTRAINT `accountingcustomerledgerentry_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Map the four system-account keys invoice approval needs.
-- Each row points the system key at an existing chart-of-accounts row.
-- Cuids are deterministic (random-but-unique) — using fixed strings is fine
-- for system-account rows because the (key) UNIQUE index is the lookup key.
-- ---------------------------------------------------------------------------
INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_debtor_receivable_v1', 'DEBTOR_RECEIVABLE', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'AAR001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_product_income_v1', 'PRODUCT_INCOME', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'PRIN0001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_cogs_v1', 'COST_OF_GOODS_SOLD', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'COGS0001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_sales_discount_expense_v1', 'SALES_DISCOUNT_EXPENSE', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'EES001';
