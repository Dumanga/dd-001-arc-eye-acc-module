-- CreateEnum
ALTER TABLE `accountinguser` ADD COLUMN IF NOT EXISTS `_po_migration_placeholder` TINYINT NULL;
ALTER TABLE `accountinguser` DROP COLUMN IF EXISTS `_po_migration_placeholder`;

-- CreateEnum (AccountingPoStatus) — MySQL uses VARCHAR for enums via Prisma
-- CreateTable: accountingpurchaseorder
CREATE TABLE `accountingpurchaseorder` (
    `id` VARCHAR(191) NOT NULL,
    `poNumber` VARCHAR(50) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `supplierRef` VARCHAR(100) NOT NULL DEFAULT '',
    `buyerCode` VARCHAR(50) NOT NULL DEFAULT '',
    `poDate` DATE NOT NULL,
    `expectedDate` DATE NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NOT NULL,
    `terms` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingpurchaseorder_poNumber_key`(`poNumber`),
    INDEX `accountingpurchaseorder_supplierId_idx`(`supplierId`),
    INDEX `accountingpurchaseorder_createdById_idx`(`createdById`),
    INDEX `accountingpurchaseorder_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountingpurchaseorder_poDate_idx`(`poDate`),
    INDEX `accountingpurchaseorder_expectedDate_idx`(`expectedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountingpurchaseorderline
CREATE TABLE `accountingpurchaseorderline` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `quantity` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingpurchaseorderline_purchaseOrderId_lineOrder_idx`(`purchaseOrderId`, `lineOrder`),
    INDEX `accountingpurchaseorderline_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingpurchaseorder` ADD CONSTRAINT `accountingpurchaseorder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpurchaseorder` ADD CONSTRAINT `accountingpurchaseorder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpurchaseorderline` ADD CONSTRAINT `accountingpurchaseorderline_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `accountingpurchaseorder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpurchaseorderline` ADD CONSTRAINT `accountingpurchaseorderline_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
