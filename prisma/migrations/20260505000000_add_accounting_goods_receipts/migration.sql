-- CreateTable: accountinggoodsreceipt
CREATE TABLE `accountinggoodsreceipt` (
    `id` VARCHAR(191) NOT NULL,
    `grnNumber` VARCHAR(50) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `receiptDate` DATE NOT NULL,
    `receivedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `deliveryNoteRef` VARCHAR(100) NOT NULL DEFAULT '',
    `vehicleRef` VARCHAR(150) NOT NULL DEFAULT '',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `notes` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountinggoodsreceipt_grnNumber_key`(`grnNumber`),
    INDEX `accountinggoodsreceipt_purchaseOrderId_idx`(`purchaseOrderId`),
    INDEX `accountinggoodsreceipt_supplierId_idx`(`supplierId`),
    INDEX `accountinggoodsreceipt_createdById_idx`(`createdById`),
    INDEX `accountinggoodsreceipt_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountinggoodsreceipt_receiptDate_idx`(`receiptDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountinggoodsreceiptline
CREATE TABLE `accountinggoodsreceiptline` (
    `id` VARCHAR(191) NOT NULL,
    `goodsReceiptId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `purchaseOrderLineId` VARCHAR(191) NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `orderedQty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `receivedQty` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `condition` ENUM('GOOD', 'DAMAGED', 'SHORT', 'EXCESS') NOT NULL DEFAULT 'GOOD',
    `requiresSerial` BOOLEAN NOT NULL DEFAULT false,
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountinggoodsreceiptline_goodsReceiptId_lineOrder_idx`(`goodsReceiptId`, `lineOrder`),
    INDEX `accountinggoodsreceiptline_productId_idx`(`productId`),
    INDEX `accountinggoodsreceiptline_purchaseOrderLineId_idx`(`purchaseOrderLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountinggoodsreceiptlineserial
CREATE TABLE `accountinggoodsreceiptlineserial` (
    `id` VARCHAR(191) NOT NULL,
    `goodsReceiptLineId` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(120) NOT NULL,
    `position` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountinggoodsreceiptlineserial_goodsReceiptLineId_position_idx`(`goodsReceiptLineId`, `position`),
    INDEX `accountinggoodsreceiptlineserial_serialNumber_idx`(`serialNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceipt` ADD CONSTRAINT `accountinggoodsreceipt_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `accountingpurchaseorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceipt` ADD CONSTRAINT `accountinggoodsreceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceipt` ADD CONSTRAINT `accountinggoodsreceipt_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceipt` ADD CONSTRAINT `accountinggoodsreceipt_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceiptline` ADD CONSTRAINT `accountinggoodsreceiptline_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `accountinggoodsreceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceiptline` ADD CONSTRAINT `accountinggoodsreceiptline_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceiptline` ADD CONSTRAINT `accountinggoodsreceiptline_purchaseOrderLineId_fkey` FOREIGN KEY (`purchaseOrderLineId`) REFERENCES `accountingpurchaseorderline`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountinggoodsreceiptlineserial` ADD CONSTRAINT `accountinggoodsreceiptlineserial_goodsReceiptLineId_fkey` FOREIGN KEY (`goodsReceiptLineId`) REFERENCES `accountinggoodsreceiptline`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
