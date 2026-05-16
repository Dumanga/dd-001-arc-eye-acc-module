-- Expense Voucher (EXP) per accounting-theories.md §8. A general-purpose
-- voucher that credits a single cash/bank pay-from account and debits one or
-- more arbitrary chart-of-accounts rows. No supplier ledger.

-- 1) Extend journal doc-type enum so the GL rows can carry documentType=EXP.
ALTER TABLE `accountingjournalentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP') NOT NULL;
ALTER TABLE `accountingsupplierledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP') NOT NULL;
ALTER TABLE `accountingcustomerledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP') NOT NULL;

-- 2) Create the voucher header table.
CREATE TABLE `accountingexpensevoucher` (
  `id`               VARCHAR(191) NOT NULL,
  `voucherNumber`    VARCHAR(50)  NOT NULL,
  `storeId`          VARCHAR(191) NOT NULL,
  `payFromAccountId` VARCHAR(191) NOT NULL,
  `voucherDate`      DATE NOT NULL,
  `currency`         VARCHAR(10) NOT NULL DEFAULT 'LKR',
  `preparedBy`       VARCHAR(100) NOT NULL DEFAULT '',
  `reference`        VARCHAR(150) NOT NULL DEFAULT '',
  `total`            DECIMAL(18,4) NOT NULL DEFAULT 0,
  `notes`            TEXT NOT NULL,
  `status`           ENUM('DRAFT','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `createdById`      VARCHAR(191) NOT NULL,
  `approvedById`     VARCHAR(191) NULL,
  `approvedAt`       DATETIME(3) NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,

  UNIQUE INDEX `accountingexpensevoucher_voucherNumber_key`(`voucherNumber`),
  INDEX `accountingexpensevoucher_storeId_idx`(`storeId`),
  INDEX `accountingexpensevoucher_payFromAccountId_idx`(`payFromAccountId`),
  INDEX `accountingexpensevoucher_createdById_idx`(`createdById`),
  INDEX `accountingexpensevoucher_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `accountingexpensevoucher_voucherDate_idx`(`voucherDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Create the line table.
CREATE TABLE `accountingexpensevoucherline` (
  `id`               VARCHAR(191) NOT NULL,
  `expenseVoucherId` VARCHAR(191) NOT NULL,
  `accountId`        VARCHAR(191) NOT NULL,
  `amount`           DECIMAL(18,4) NOT NULL DEFAULT 0,
  `paymentMethod`    VARCHAR(30) NOT NULL DEFAULT 'CASH',
  `memo`             VARCHAR(500) NOT NULL DEFAULT '',
  `lineOrder`        INT NOT NULL DEFAULT 0,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `accountingexpensevoucherline_expenseVoucherId_lineOrder_idx`(`expenseVoucherId`, `lineOrder`),
  INDEX `accountingexpensevoucherline_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) Foreign keys.
ALTER TABLE `accountingexpensevoucher`
  ADD CONSTRAINT `accountingexpensevoucher_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingexpensevoucher_payFromAccountId_fkey`
    FOREIGN KEY (`payFromAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingexpensevoucher_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingexpensevoucher_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `accountingexpensevoucherline`
  ADD CONSTRAINT `accountingexpensevoucherline_expenseVoucherId_fkey`
    FOREIGN KEY (`expenseVoucherId`) REFERENCES `accountingexpensevoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingexpensevoucherline_accountId_fkey`
    FOREIGN KEY (`accountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
