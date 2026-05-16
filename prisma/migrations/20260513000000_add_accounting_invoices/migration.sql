-- CreateTable: AccountingInvoice + AccountingInvoiceLine

-- Invoice status enum is stored as a MySQL ENUM column (no separate DDL needed in MySQL)

CREATE TABLE `accountinginvoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(50) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'LKR',
    `invoiceDate` DATE NOT NULL,
    `dueDate` DATE NOT NULL,
    `customerRef` VARCHAR(100) NOT NULL DEFAULT '',
    `billedBy` VARCHAR(100) NOT NULL DEFAULT '',
    `notes` TEXT NOT NULL,
    `terms` TEXT NOT NULL,
    `discount` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    `subtotal` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    `total` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountinginvoice_invoiceNumber_key`(`invoiceNumber`),
    INDEX `accountinginvoice_customerId_idx`(`customerId`),
    INDEX `accountinginvoice_createdById_idx`(`createdById`),
    INDEX `accountinginvoice_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountinginvoice_invoiceDate_idx`(`invoiceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `accountinginvoiceline` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(60) NOT NULL,
    `itemName` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `quantity` DECIMAL(18,4) NOT NULL,
    `unitPrice` DECIMAL(18,4) NOT NULL,
    `lineTotal` DECIMAL(18,4) NOT NULL,
    `uomName` VARCHAR(100) NOT NULL DEFAULT '',
    `uomBase` VARCHAR(100) NOT NULL DEFAULT '',
    `uomMinQty` DECIMAL(18,4) NOT NULL DEFAULT 1.0000,
    `lineOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `accountinginvoiceline_invoiceId_lineOrder_idx`(`invoiceId`, `lineOrder`),
    INDEX `accountinginvoiceline_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountinginvoice` ADD CONSTRAINT `accountinginvoice_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountinginvoice` ADD CONSTRAINT `accountinginvoice_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `accountinginvoice` ADD CONSTRAINT `accountinginvoice_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `accountinginvoiceline` ADD CONSTRAINT `accountinginvoiceline_invoiceId_fkey`
    FOREIGN KEY (`invoiceId`) REFERENCES `accountinginvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `accountinginvoiceline` ADD CONSTRAINT `accountinginvoiceline_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
