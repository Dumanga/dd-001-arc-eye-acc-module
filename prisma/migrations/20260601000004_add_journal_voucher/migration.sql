-- Journal Entry Voucher (JEV) per accounting-theories.md §9. A general-purpose
-- manual posting tool: each line picks any account and carries either a debit
-- or a credit amount (not both). Voucher must balance (∑Dr = ∑Cr) before
-- posting. No sub-ledger — pure GL.

-- 1) Extend journal doc-type enum so GL rows can carry documentType=JEV.
--    All N lines of a voucher share (documentType=JEV, documentNumber)
--    so reports can group them under one journal-entry header.
ALTER TABLE `accountingjournalentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV') NOT NULL;
ALTER TABLE `accountingsupplierledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV') NOT NULL;
ALTER TABLE `accountingcustomerledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV') NOT NULL;

-- 2) Create the voucher header table.
CREATE TABLE `accountingjournalvoucher` (
  `id`            VARCHAR(191) NOT NULL,
  `voucherNumber` VARCHAR(50)  NOT NULL,
  `storeId`       VARCHAR(191) NOT NULL,
  `entryDate`     DATE NOT NULL,
  `currency`      VARCHAR(10) NOT NULL DEFAULT 'LKR',
  `description`   VARCHAR(500) NOT NULL DEFAULT '',
  `total`         DECIMAL(18,4) NOT NULL DEFAULT 0,
  `notes`         TEXT NOT NULL,
  `status`        ENUM('DRAFT','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `createdById`   VARCHAR(191) NOT NULL,
  `postedById`    VARCHAR(191) NULL,
  `postedAt`      DATETIME(3) NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,

  UNIQUE INDEX `accountingjournalvoucher_voucherNumber_key`(`voucherNumber`),
  INDEX `accountingjournalvoucher_storeId_idx`(`storeId`),
  INDEX `accountingjournalvoucher_createdById_idx`(`createdById`),
  INDEX `accountingjournalvoucher_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `accountingjournalvoucher_entryDate_idx`(`entryDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Create the line table. Each line carries either debitAmount > 0 or
--    creditAmount > 0 (the other is 0). This matches the §9 form shape
--    and keeps the Dr/Cr column intent explicit.
CREATE TABLE `accountingjournalvoucherline` (
  `id`               VARCHAR(191) NOT NULL,
  `journalVoucherId` VARCHAR(191) NOT NULL,
  `accountId`        VARCHAR(191) NOT NULL,
  `debitAmount`      DECIMAL(18,4) NOT NULL DEFAULT 0,
  `creditAmount`     DECIMAL(18,4) NOT NULL DEFAULT 0,
  `memo`             VARCHAR(500) NOT NULL DEFAULT '',
  `lineOrder`        INT NOT NULL DEFAULT 0,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `accountingjournalvoucherline_journalVoucherId_lineOrder_idx`(`journalVoucherId`, `lineOrder`),
  INDEX `accountingjournalvoucherline_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) Foreign keys.
ALTER TABLE `accountingjournalvoucher`
  ADD CONSTRAINT `accountingjournalvoucher_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingjournalvoucher_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingjournalvoucher_postedById_fkey`
    FOREIGN KEY (`postedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `accountingjournalvoucherline`
  ADD CONSTRAINT `accountingjournalvoucherline_journalVoucherId_fkey`
    FOREIGN KEY (`journalVoucherId`) REFERENCES `accountingjournalvoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingjournalvoucherline_accountId_fkey`
    FOREIGN KEY (`accountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
