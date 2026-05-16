-- CreateTable: accountingjournalentry — global double-entry general ledger
CREATE TABLE `accountingjournalentry` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `accountCode` VARCHAR(30) NOT NULL,
    `accountName` VARCHAR(200) NOT NULL,
    `documentType` ENUM('GRN', 'GRR', 'PV', 'INV', 'SR', 'RC', 'POS', 'JE') NOT NULL,
    `documentId` VARCHAR(100) NOT NULL,
    `documentNumber` VARCHAR(50) NOT NULL,
    `documentDate` DATE NOT NULL,
    `sourceLineId` VARCHAR(100) NULL,
    `supplierId` VARCHAR(191) NULL,
    `supplierCode` VARCHAR(50) NULL,
    `supplierName` VARCHAR(200) NULL,
    `customerId` VARCHAR(191) NULL,
    `customerCode` VARCHAR(50) NULL,
    `customerName` VARCHAR(200) NULL,
    `productId` VARCHAR(191) NULL,
    `productCode` VARCHAR(60) NULL,
    `productName` VARCHAR(200) NULL,
    `value` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `narration` VARCHAR(500) NOT NULL DEFAULT '',
    `reversalOfDocumentId` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingjournalentry_accountId_documentDate_idx`(`accountId`, `documentDate`),
    INDEX `accountingjournalentry_documentType_documentNumber_idx`(`documentType`, `documentNumber`),
    INDEX `accountingjournalentry_documentType_documentId_idx`(`documentType`, `documentId`),
    INDEX `accountingjournalentry_supplierId_documentDate_idx`(`supplierId`, `documentDate`),
    INDEX `accountingjournalentry_productId_documentDate_idx`(`productId`, `documentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountingsupplierledgerentry — supplier sub-ledger
CREATE TABLE `accountingsupplierledgerentry` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `supplierCode` VARCHAR(50) NOT NULL,
    `supplierName` VARCHAR(200) NOT NULL,
    `documentType` ENUM('GRN', 'GRR', 'PV', 'INV', 'SR', 'RC', 'POS', 'JE') NOT NULL,
    `documentId` VARCHAR(100) NOT NULL,
    `documentNumber` VARCHAR(50) NOT NULL,
    `documentDate` DATE NOT NULL,
    `value` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `narration` VARCHAR(500) NOT NULL DEFAULT '',
    `reversalOfDocumentId` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountingsupplierledgerentry_supplierId_documentDate_idx`(`supplierId`, `documentDate`),
    INDEX `accountingsupplierledgerentry_documentType_documentNumber_idx`(`documentType`, `documentNumber`),
    INDEX `accountingsupplierledgerentry_documentType_documentId_idx`(`documentType`, `documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: accountingsystemaccount — key→accountId mapping
CREATE TABLE `accountingsystemaccount` (
    `id` VARCHAR(191) NOT NULL,
    `key` ENUM('SUPPLIER_PAYABLE', 'DEBTOR_RECEIVABLE', 'PRODUCTION_INVENTORY', 'CASH_ON_HAND', 'SSCL_TAX_PAYABLE', 'VAT_PAYABLE', 'PRODUCT_INCOME', 'CASH_DISCOUNT_INCOME', 'COST_OF_GOODS_SOLD', 'SALES_DISCOUNT_EXPENSE', 'CASH_DISCOUNT_EXPENSE') NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingsystemaccount_key_key`(`key`),
    UNIQUE INDEX `accountingsystemaccount_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingjournalentry` ADD CONSTRAINT `accountingjournalentry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingjournalentry` ADD CONSTRAINT `accountingjournalentry_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingjournalentry` ADD CONSTRAINT `accountingjournalentry_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingjournalentry` ADD CONSTRAINT `accountingjournalentry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsupplierledgerentry` ADD CONSTRAINT `accountingsupplierledgerentry_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsupplierledgerentry` ADD CONSTRAINT `accountingsupplierledgerentry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsystemaccount` ADD CONSTRAINT `accountingsystemaccount_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
