-- CreateTable
CREATE TABLE `accountingformidconfig` (
    `id` VARCHAR(191) NOT NULL,
    `formType` ENUM('PO', 'GRN', 'INV', 'RC', 'POS', 'PV') NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `yearToken` VARCHAR(10) NOT NULL DEFAULT '',
    `rangeFrom` VARCHAR(10) NOT NULL,
    `rangeTo` VARCHAR(10) NOT NULL,
    `nextNumber` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingformidconfig_formType_key`(`formType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingremark` (
    `id` VARCHAR(191) NOT NULL,
    `documentType` ENUM('PURCHASE_ORDER', 'INVOICE', 'QUOTATION', 'GRN', 'RECEIPT', 'POS_BILL', 'SUPPLIER_PAYMENT') NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingremark_documentType_key`(`documentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
