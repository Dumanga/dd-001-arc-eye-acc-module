-- Phase 4 of new-critical-update-plan.md.
--
-- Per-branch stock-on-hand keyed (productId, storeId). Replaces the legacy
-- global `accountingproduct.stockOnHand` counter in a future cleanup; for now
-- the legacy column is kept in sync inside the same approve transaction so any
-- code still reading it keeps working during the rollout window.

CREATE TABLE `accountingproductstock` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `qtyOnHand` DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingproductstock_productId_storeId_key`(`productId`, `storeId`),
    INDEX `accountingproductstock_productId_idx`(`productId`),
    INDEX `accountingproductstock_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accountingproductstock` ADD CONSTRAINT `accountingproductstock_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `accountingproductstock` ADD CONSTRAINT `accountingproductstock_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
