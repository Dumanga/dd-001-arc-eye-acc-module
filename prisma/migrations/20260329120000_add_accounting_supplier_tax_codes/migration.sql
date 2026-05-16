-- CreateTable
CREATE TABLE `accountingsuppliertaxcode` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `taxCodeId` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingsuppliertaxcode_supplierId_taxCodeId_key`(`supplierId`, `taxCodeId`),
    INDEX `accountingsuppliertaxcode_supplierId_displayOrder_idx`(`supplierId`, `displayOrder`),
    INDEX `accountingsuppliertaxcode_taxCodeId_displayOrder_idx`(`taxCodeId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill existing nullable supplier sales tax code links into the new join table.
INSERT INTO `accountingsuppliertaxcode` (`id`, `supplierId`, `taxCodeId`, `displayOrder`, `createdAt`, `updatedAt`)
SELECT
    LOWER(REPLACE(UUID(), '-', '')),
    `supplierId`,
    `taxCodeId`,
    0,
    `createdAt`,
    `updatedAt`
FROM `accountingsuppliersalesinfo`
WHERE `taxCodeId` IS NOT NULL;

-- AddForeignKey
ALTER TABLE `accountingsuppliertaxcode`
    ADD CONSTRAINT `accountingsuppliertaxcode_supplierId_fkey`
    FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountingsuppliertaxcode`
    ADD CONSTRAINT `accountingsuppliertaxcode_taxCodeId_fkey`
    FOREIGN KEY (`taxCodeId`) REFERENCES `accountingtaxcode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE `accountingsuppliersalesinfo` DROP FOREIGN KEY `accountingsuppliersalesinfo_taxCodeId_fkey`;

-- DropIndex
DROP INDEX `accountingsuppliersalesinfo_taxCodeId_idx` ON `accountingsuppliersalesinfo`;

-- DropColumn
ALTER TABLE `accountingsuppliersalesinfo` DROP COLUMN `taxCodeId`;
