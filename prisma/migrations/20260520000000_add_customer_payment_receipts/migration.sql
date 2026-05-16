-- Customer Payment Receipt module — schema mirror of supplier payment voucher.
--
-- Posting model lives in accounting-theories.md § 5 / 5.1 / 5.2:
--   without discount: +cash, -AAR, -customerLedger
--   with discount:    above + +cashDiscountExpense, -AAR, -customerLedger
--
-- Allocations link to invoices when settling specific invoices, or carry
-- isOnAccount=true (with description, no invoiceId) for advance / on-account
-- credits.

-- ---------------------------------------------------------------------------
-- accountingcustomerpaymentreceipt — header
-- ---------------------------------------------------------------------------
CREATE TABLE `accountingcustomerpaymentreceipt` (
    `id` VARCHAR(191) NOT NULL,
    `receiptNumber` VARCHAR(50) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `receiveToAccountId` VARCHAR(191) NOT NULL,
    `receiptDate` DATE NOT NULL,
    `method` ENUM('BANK_TRANSFER','CHEQUE','CASH','ONLINE_TRANSFER') NOT NULL DEFAULT 'CASH',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `collectedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `reference` VARCHAR(150) NOT NULL DEFAULT '',
    `chequeNo` VARCHAR(80) NOT NULL DEFAULT '',
    `receivingTotal` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `notes` TEXT NOT NULL,
    `status` ENUM('DRAFT','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingcustomerpaymentreceipt_receiptNumber_key`(`receiptNumber`),
    INDEX `accustpaymentreceipt_customerId_idx`(`customerId`),
    INDEX `accustpaymentreceipt_storeId_idx`(`storeId`),
    INDEX `accustpaymentreceipt_receiveToAccountId_idx`(`receiveToAccountId`),
    INDEX `accustpaymentreceipt_createdById_idx`(`createdById`),
    INDEX `accustpaymentreceipt_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accustpaymentreceipt_receiptDate_idx`(`receiptDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingcustomerpaymentreceipt` ADD CONSTRAINT `accountingcustomerpaymentreceipt_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerpaymentreceipt` ADD CONSTRAINT `accountingcustomerpaymentreceipt_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerpaymentreceipt` ADD CONSTRAINT `accountingcustomerpaymentreceipt_receiveToAccountId_fkey`
    FOREIGN KEY (`receiveToAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerpaymentreceipt` ADD CONSTRAINT `accountingcustomerpaymentreceipt_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerpaymentreceipt` ADD CONSTRAINT `accountingcustomerpaymentreceipt_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- accountingcustomerpaymentallocation — line
-- ---------------------------------------------------------------------------
CREATE TABLE `accountingcustomerpaymentallocation` (
    `id` VARCHAR(191) NOT NULL,
    `customerPaymentReceiptId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `invoiceNumber` VARCHAR(50) NOT NULL DEFAULT '',
    `invoiceDate` DATE NULL,
    `totalAmount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `receivableAmount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `receivingAmount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `notes` VARCHAR(500) NOT NULL DEFAULT '',
    `isOnAccount` BOOLEAN NOT NULL DEFAULT false,
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accustpaymentalloc_receiptId_lineOrder_idx`(`customerPaymentReceiptId`, `lineOrder`),
    INDEX `accustpaymentalloc_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingcustomerpaymentallocation` ADD CONSTRAINT `accountingcustomerpaymentallocation_receiptId_fkey`
    FOREIGN KEY (`customerPaymentReceiptId`) REFERENCES `accountingcustomerpaymentreceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerpaymentallocation` ADD CONSTRAINT `accountingcustomerpaymentallocation_invoiceId_fkey`
    FOREIGN KEY (`invoiceId`) REFERENCES `accountinginvoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Map CASH_DISCOUNT_EXPENSE → EOPS001 CASH DISCOUNT EXPENSES.
-- The customer-side mirror of CASH_DISCOUNT_INCOME from the supplier flow
-- (we grant a customer a discount = expense to us).
-- INSERT IGNORE so re-runs and pre-mapped DBs are no-ops.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_cash_discount_expense_v1', 'CASH_DISCOUNT_EXPENSE', `id`, NOW(3)
FROM `chartofaccounts`
WHERE `code` = 'EOPS001';
