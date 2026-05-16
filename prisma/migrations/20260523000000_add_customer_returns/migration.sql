-- Customer Return module — schema mirror of supplier-side goods return.
--
-- Posting model lives in accounting-theories.md § 6 / 6.1 / 6.2:
--   without discount: -AAR (gross), -Income (gross), +Inventory (cost), -COGS (cost), -customerLedger (gross)
--   with discount:    above + +AAR (discount), -SalesDiscount (discount), +customerLedger (discount)
--
-- Cap: invoice.total minus approved CPR receivable_cleared minus approved CR
-- net value (the paid-portion-is-closed rule from the form's UI).
--
-- Cost basis: read from the original COGS GL row of the source invoice line
-- (sourceLineId joins back to AccountingInvoiceLine).

-- ---------------------------------------------------------------------------
-- 1. Expand AccountingFormType to include SR (sales return form-id sequence)
-- ---------------------------------------------------------------------------
ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType` ENUM('PO','GRN','GRR','QT','INV','SR','RC','POS','PV') NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. accountingcustomerreturn — header
-- ---------------------------------------------------------------------------
CREATE TABLE `accountingcustomerreturn` (
    `id` VARCHAR(191) NOT NULL,
    `returnNumber` VARCHAR(50) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `returnDate` DATE NOT NULL,
    `returnedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `reasonHeader` VARCHAR(200) NOT NULL DEFAULT '',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `notes` TEXT NOT NULL,
    `totalQty` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `totalGross` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `totalDiscount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `totalNet` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingcustomerreturn_returnNumber_key`(`returnNumber`),
    INDEX `accustreturn_invoiceId_idx`(`invoiceId`),
    INDEX `accustreturn_customerId_idx`(`customerId`),
    INDEX `accustreturn_storeId_idx`(`storeId`),
    INDEX `accustreturn_createdById_idx`(`createdById`),
    INDEX `accustreturn_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accustreturn_returnDate_idx`(`returnDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingcustomerreturn` ADD CONSTRAINT `accountingcustomerreturn_invoiceId_fkey`
    FOREIGN KEY (`invoiceId`) REFERENCES `accountinginvoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturn` ADD CONSTRAINT `accountingcustomerreturn_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturn` ADD CONSTRAINT `accountingcustomerreturn_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturn` ADD CONSTRAINT `accountingcustomerreturn_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturn` ADD CONSTRAINT `accountingcustomerreturn_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. accountingcustomerreturnline — line
-- ---------------------------------------------------------------------------
CREATE TABLE `accountingcustomerreturnline` (
    `id` VARCHAR(191) NOT NULL,
    `customerReturnId` VARCHAR(191) NOT NULL,
    `invoiceLineId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(60) NOT NULL,
    `itemName` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `uomMinQty` DECIMAL(18,4) NOT NULL DEFAULT 1,
    `originalQty` DECIMAL(18,4) NOT NULL,
    `unitPrice` DECIMAL(18,4) NOT NULL,
    `returnQty` DECIMAL(18,4) NOT NULL,
    `lineGross` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `lineDiscount` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `lineNet` DECIMAL(18,4) NOT NULL DEFAULT 0,
    `reason` ENUM('DAMAGED','WRONG_ITEM','EXPIRED','EXCESS','OTHER') NOT NULL DEFAULT 'OTHER',
    `notes` VARCHAR(500) NOT NULL DEFAULT '',
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accustreturnline_returnId_lineOrder_idx`(`customerReturnId`, `lineOrder`),
    INDEX `accustreturnline_invoiceLineId_idx`(`invoiceLineId`),
    INDEX `accustreturnline_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingcustomerreturnline` ADD CONSTRAINT `accountingcustomerreturnline_returnId_fkey`
    FOREIGN KEY (`customerReturnId`) REFERENCES `accountingcustomerreturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturnline` ADD CONSTRAINT `accountingcustomerreturnline_invoiceLineId_fkey`
    FOREIGN KEY (`invoiceLineId`) REFERENCES `accountinginvoiceline`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountingcustomerreturnline` ADD CONSTRAINT `accountingcustomerreturnline_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
