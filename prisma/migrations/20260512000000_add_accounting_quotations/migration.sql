-- CreateTable
CREATE TABLE `accountingquotation` (
    `id` VARCHAR(191) NOT NULL,
    `quotationNumber` VARCHAR(50) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `quotationDate` DATE NOT NULL,
    `validUntil` DATE NOT NULL,
    `customerRef` VARCHAR(100) NOT NULL DEFAULT '',
    `preparedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `notes` TEXT NOT NULL,
    `terms` TEXT NOT NULL,
    `discount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingquotation_quotationNumber_key`(`quotationNumber`),
    INDEX `accountingquotation_customerId_idx`(`customerId`),
    INDEX `accountingquotation_createdById_idx`(`createdById`),
    INDEX `accountingquotation_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountingquotation_quotationDate_idx`(`quotationDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingquotationline` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(60) NOT NULL,
    `itemName` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `quantity` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `lineTotal` DECIMAL(18, 4) NOT NULL,
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `uomMinQty` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `lineOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingquotationline_quotationId_lineOrder_idx`(`quotationId`, `lineOrder`),
    INDEX `accountingquotationline_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingquotation` ADD CONSTRAINT `accountingquotation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingquotation` ADD CONSTRAINT `accountingquotation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingquotation` ADD CONSTRAINT `accountingquotation_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingquotationline` ADD CONSTRAINT `accountingquotationline_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `accountingquotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingquotationline` ADD CONSTRAINT `accountingquotationline_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
