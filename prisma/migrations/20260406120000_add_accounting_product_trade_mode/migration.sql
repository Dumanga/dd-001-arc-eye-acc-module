ALTER TABLE `accountingproduct`
  DROP FOREIGN KEY `accountingproduct_inventoryAccountId_fkey`,
  DROP FOREIGN KEY `accountingproduct_cogsAccountId_fkey`,
  DROP FOREIGN KEY `accountingproduct_incomeAccountId_fkey`;

ALTER TABLE `accountingproduct`
  ADD COLUMN `tradeMode` ENUM('BUY', 'SELL', 'BOTH') NOT NULL DEFAULT 'BOTH' AFTER `itemType`,
  MODIFY `purchaseName` VARCHAR(200) NULL,
  MODIFY `costPrice` DECIMAL(18, 4) NULL,
  MODIFY `inventoryAccountId` VARCHAR(191) NULL,
  MODIFY `cogsAccountId` VARCHAR(191) NULL,
  MODIFY `salesName` VARCHAR(200) NULL,
  MODIFY `salesPrice` DECIMAL(18, 4) NULL,
  MODIFY `incomeAccountId` VARCHAR(191) NULL;

UPDATE `accountingproduct`
SET `tradeMode` = 'BOTH'
WHERE `tradeMode` IS NULL;

ALTER TABLE `accountingproduct`
  ADD INDEX `accountingproduct_tradeMode_createdAt_idx`(`tradeMode`, `createdAt`);

ALTER TABLE `accountingproduct`
  ADD CONSTRAINT `accountingproduct_inventoryAccountId_fkey`
    FOREIGN KEY (`inventoryAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingproduct_cogsAccountId_fkey`
    FOREIGN KEY (`cogsAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingproduct_incomeAccountId_fkey`
    FOREIGN KEY (`incomeAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
