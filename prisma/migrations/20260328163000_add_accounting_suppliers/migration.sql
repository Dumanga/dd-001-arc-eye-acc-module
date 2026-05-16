-- CreateTable
CREATE TABLE `accountingsupplier` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `primaryPhoneCountryCode` VARCHAR(191) NOT NULL,
    `primaryPhoneDialCode` VARCHAR(191) NOT NULL,
    `primaryPhoneLocalNumber` VARCHAR(191) NOT NULL,
    `internalNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingsupplier_code_key`(`code`),
    INDEX `accountingsupplier_name_idx`(`name`),
    INDEX `accountingsupplier_email_idx`(`email`),
    INDEX `accountingsupplier_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingsuppliercontactinfo` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `addressLine1` VARCHAR(191) NULL,
    `addressLine2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `postalCode` VARCHAR(191) NULL,
    `alternatePhoneCountryCode` VARCHAR(191) NULL,
    `alternatePhoneDialCode` VARCHAR(191) NULL,
    `alternatePhoneLocalNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingsuppliercontactinfo_supplierId_key`(`supplierId`),
    INDEX `accountingsuppliercontactinfo_country_city_idx`(`country`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingsuppliersalesinfo` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL DEFAULT 'LKR',
    `tinNumber` VARCHAR(191) NULL,
    `taxCodeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingsuppliersalesinfo_supplierId_key`(`supplierId`),
    INDEX `accountingsuppliersalesinfo_currencyCode_idx`(`currencyCode`),
    INDEX `accountingsuppliersalesinfo_taxCodeId_idx`(`taxCodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingsuppliersalescontact` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `designation` VARCHAR(191) NOT NULL,
    `phoneCountryCode` VARCHAR(191) NOT NULL,
    `phoneDialCode` VARCHAR(191) NOT NULL,
    `phoneLocalNumber` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `accountingsuppliersalescontact_supplierId_displayOrder_idx`(`supplierId`, `displayOrder`),
    INDEX `accountingsuppliersalescontact_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingsupplierbankaccount` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `branchName` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `accountingsupplierbankaccount_supplierId_displayOrder_idx`(`supplierId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingsuppliercontactinfo` ADD CONSTRAINT `accountingsuppliercontactinfo_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsuppliersalesinfo` ADD CONSTRAINT `accountingsuppliersalesinfo_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsuppliersalesinfo` ADD CONSTRAINT `accountingsuppliersalesinfo_taxCodeId_fkey` FOREIGN KEY (`taxCodeId`) REFERENCES `accountingtaxcode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsuppliersalescontact` ADD CONSTRAINT `accountingsuppliersalescontact_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsupplierbankaccount` ADD CONSTRAINT `accountingsupplierbankaccount_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
