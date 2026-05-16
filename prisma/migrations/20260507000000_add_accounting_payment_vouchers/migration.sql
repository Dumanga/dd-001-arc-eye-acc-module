-- CreateTable: accountingpaymentvoucher
CREATE TABLE `accountingpaymentvoucher` (
    `id` VARCHAR(191) NOT NULL,
    `voucherNumber` VARCHAR(50) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `payFromAccountId` VARCHAR(191) NOT NULL,
    `voucherDate` DATE NOT NULL,
    `method` ENUM('BANK_TRANSFER', 'CHEQUE', 'CASH', 'ONLINE_TRANSFER') NOT NULL DEFAULT 'BANK_TRANSFER',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `preparedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `reference` VARCHAR(150) NOT NULL DEFAULT '',
    `chequeNo` VARCHAR(80) NOT NULL DEFAULT '',
    `paymentTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingpaymentvoucher_voucherNumber_key`(`voucherNumber`),
    INDEX `accountingpaymentvoucher_supplierId_idx`(`supplierId`),
    INDEX `accountingpaymentvoucher_payFromAccountId_idx`(`payFromAccountId`),
    INDEX `accountingpaymentvoucher_createdById_idx`(`createdById`),
    INDEX `accountingpaymentvoucher_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountingpaymentvoucher_voucherDate_idx`(`voucherDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountingpaymentvoucherallocation
CREATE TABLE `accountingpaymentvoucherallocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentVoucherId` VARCHAR(191) NOT NULL,
    `goodsReceiptId` VARCHAR(191) NULL,
    `grnNumber` VARCHAR(50) NOT NULL DEFAULT '',
    `grnDate` DATE NULL,
    `dueDate` DATE NULL,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `payableAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `payingAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(500) NOT NULL DEFAULT '',
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingpvalloc_voucherId_lineOrder_idx`(`paymentVoucherId`, `lineOrder`),
    INDEX `accountingpvalloc_goodsReceiptId_idx`(`goodsReceiptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucher` ADD CONSTRAINT `accountingpaymentvoucher_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucher` ADD CONSTRAINT `accountingpaymentvoucher_payFromAccountId_fkey` FOREIGN KEY (`payFromAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucher` ADD CONSTRAINT `accountingpaymentvoucher_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucher` ADD CONSTRAINT `accountingpaymentvoucher_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucherallocation` ADD CONSTRAINT `accountingpvalloc_paymentVoucherId_fkey` FOREIGN KEY (`paymentVoucherId`) REFERENCES `accountingpaymentvoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingpaymentvoucherallocation` ADD CONSTRAINT `accountingpvalloc_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `accountinggoodsreceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
