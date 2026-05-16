-- Expand AccountingFormType enum on accountingformidconfig.formType to include GRR
ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType` ENUM(
    'PO',
    'GRN',
    'GRR',
    'INV',
    'RC',
    'POS',
    'PV'
  ) NOT NULL;

-- CreateTable: accountinggoodsreturn
CREATE TABLE `accountinggoodsreturn` (
    `id` VARCHAR(191) NOT NULL,
    `returnNumber` VARCHAR(50) NOT NULL,
    `goodsReceiptId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `returnDate` DATE NOT NULL,
    `returnedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `reasonHeader` VARCHAR(200) NOT NULL DEFAULT '',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `notes` TEXT NOT NULL,
    `totalQty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountinggoodsreturn_returnNumber_key`(`returnNumber`),
    INDEX `accountinggoodsreturn_goodsReceiptId_idx`(`goodsReceiptId`),
    INDEX `accountinggoodsreturn_supplierId_idx`(`supplierId`),
    INDEX `accountinggoodsreturn_createdById_idx`(`createdById`),
    INDEX `accountinggoodsreturn_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountinggoodsreturn_returnDate_idx`(`returnDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountinggoodsreturnline
CREATE TABLE `accountinggoodsreturnline` (
    `id` VARCHAR(191) NOT NULL,
    `goodsReturnId` VARCHAR(191) NOT NULL,
    `goodsReceiptLineId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `receivedQty` DECIMAL(18, 4) NOT NULL,
    `returnQty` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `reason` ENUM('DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'EXCESS', 'OTHER') NOT NULL DEFAULT 'DAMAGED',
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountinggoodsreturnline_goodsReturnId_lineOrder_idx`(`goodsReturnId`, `lineOrder`),
    INDEX `accountinggoodsreturnline_goodsReceiptLineId_idx`(`goodsReceiptLineId`),
    INDEX `accountinggoodsreturnline_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturn` ADD CONSTRAINT `accountinggoodsreturn_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `accountinggoodsreceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturn` ADD CONSTRAINT `accountinggoodsreturn_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturn` ADD CONSTRAINT `accountinggoodsreturn_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturn` ADD CONSTRAINT `accountinggoodsreturn_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturnline` ADD CONSTRAINT `accountinggoodsreturnline_goodsReturnId_fkey` FOREIGN KEY (`goodsReturnId`) REFERENCES `accountinggoodsreturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturnline` ADD CONSTRAINT `accountinggoodsreturnline_goodsReceiptLineId_fkey` FOREIGN KEY (`goodsReceiptLineId`) REFERENCES `accountinggoodsreceiptline`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreturnline` ADD CONSTRAINT `accountinggoodsreturnline_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
