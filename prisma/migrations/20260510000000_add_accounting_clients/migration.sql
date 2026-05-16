-- CreateTable
CREATE TABLE `accountingclient` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'LKR',
    `tier` ENUM('BRONZE', 'SILVER', 'GOLD') NOT NULL DEFAULT 'BRONZE',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accountingclient_mobile_key`(`mobile`),
    INDEX `accountingclient_name_idx`(`name`),
    INDEX `accountingclient_currency_idx`(`currency`),
    INDEX `accountingclient_tier_idx`(`tier`),
    INDEX `accountingclient_createdAt_idx`(`createdAt`),
    INDEX `accountingclient_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountingclient` ADD CONSTRAINT `accountingclient_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
