-- CreateTable
CREATE TABLE `accountingproduct` (
    `id` VARCHAR(191) NOT NULL,
    `itemType` ENUM('INVENTORY_ITEM', 'SERVICE_ITEM', 'GROUP_ITEM') NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `itemCategoryId` VARCHAR(191) NULL,
    `itemBrandId` VARCHAR(191) NULL,
    `itemModelId` VARCHAR(191) NULL,
    `purchaseName` VARCHAR(200) NOT NULL,
    `costPrice` DECIMAL(18, 4) NOT NULL,
    `uomCategoryId` VARCHAR(191) NOT NULL,
    `inventoryAccountId` VARCHAR(191) NOT NULL,
    `cogsAccountId` VARCHAR(191) NOT NULL,
    `purchaseTax1Id` VARCHAR(191) NULL,
    `purchaseTax2Id` VARCHAR(191) NULL,
    `serialTrackingEnabled` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `salesName` VARCHAR(200) NOT NULL,
    `salesPrice` DECIMAL(18, 4) NOT NULL,
    `incomeAccountId` VARCHAR(191) NOT NULL,
    `salesTax1Id` VARCHAR(191) NULL,
    `salesTax2Id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingproduct_code_key`(`code`),
    INDEX `accountingproduct_purchaseName_idx`(`purchaseName`),
    INDEX `accountingproduct_salesName_idx`(`salesName`),
    INDEX `accountingproduct_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `accountingproduct_itemType_createdAt_idx`(`itemType`, `createdAt`),
    INDEX `accountingproduct_itemCategoryId_idx`(`itemCategoryId`),
    INDEX `accountingproduct_itemBrandId_idx`(`itemBrandId`),
    INDEX `accountingproduct_itemModelId_idx`(`itemModelId`),
    INDEX `accountingproduct_uomCategoryId_idx`(`uomCategoryId`),
    INDEX `accountingproduct_inventoryAccountId_idx`(`inventoryAccountId`),
    INDEX `accountingproduct_cogsAccountId_idx`(`cogsAccountId`),
    INDEX `accountingproduct_incomeAccountId_idx`(`incomeAccountId`),
    INDEX `accountingproduct_purchaseTax1Id_idx`(`purchaseTax1Id`),
    INDEX `accountingproduct_purchaseTax2Id_idx`(`purchaseTax2Id`),
    INDEX `accountingproduct_salesTax1Id_idx`(`salesTax1Id`),
    INDEX `accountingproduct_salesTax2Id_idx`(`salesTax2Id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountingproductpreferredsupplier` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingproductpreferredsupplier_productId_supplierId_key`(`productId`, `supplierId`),
    INDEX `accountingproductpreferredsupplier_productId_displayOrder_idx`(`productId`, `displayOrder`),
    INDEX `accountingproductpreferredsupplier_supplierId_displayOrder_idx`(`supplierId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_itemCategoryId_fkey`
FOREIGN KEY (`itemCategoryId`) REFERENCES `accountingitemcategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_itemBrandId_fkey`
FOREIGN KEY (`itemBrandId`) REFERENCES `accountingitembrand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_itemModelId_fkey`
FOREIGN KEY (`itemModelId`) REFERENCES `accountingitemmodel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_uomCategoryId_fkey`
FOREIGN KEY (`uomCategoryId`) REFERENCES `accountinguomcategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_inventoryAccountId_fkey`
FOREIGN KEY (`inventoryAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_cogsAccountId_fkey`
FOREIGN KEY (`cogsAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_purchaseTax1Id_fkey`
FOREIGN KEY (`purchaseTax1Id`) REFERENCES `accountingtaxcode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_purchaseTax2Id_fkey`
FOREIGN KEY (`purchaseTax2Id`) REFERENCES `accountingtaxcode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_incomeAccountId_fkey`
FOREIGN KEY (`incomeAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_salesTax1Id_fkey`
FOREIGN KEY (`salesTax1Id`) REFERENCES `accountingtaxcode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproduct` ADD CONSTRAINT `accountingproduct_salesTax2Id_fkey`
FOREIGN KEY (`salesTax2Id`) REFERENCES `accountingtaxcode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproductpreferredsupplier` ADD CONSTRAINT `accountingproductpreferredsupplier_productId_fkey`
FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingproductpreferredsupplier` ADD CONSTRAINT `accountingproductpreferredsupplier_supplierId_fkey`
FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
