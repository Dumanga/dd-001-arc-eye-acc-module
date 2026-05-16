-- Drop product → tax FKs
ALTER TABLE `accountingproduct` DROP FOREIGN KEY `accountingproduct_purchaseTax1Id_fkey`;
ALTER TABLE `accountingproduct` DROP FOREIGN KEY `accountingproduct_purchaseTax2Id_fkey`;
ALTER TABLE `accountingproduct` DROP FOREIGN KEY `accountingproduct_salesTax1Id_fkey`;
ALTER TABLE `accountingproduct` DROP FOREIGN KEY `accountingproduct_salesTax2Id_fkey`;

-- Drop product tax indexes
ALTER TABLE `accountingproduct` DROP INDEX `accountingproduct_purchaseTax1Id_idx`;
ALTER TABLE `accountingproduct` DROP INDEX `accountingproduct_purchaseTax2Id_idx`;
ALTER TABLE `accountingproduct` DROP INDEX `accountingproduct_salesTax1Id_idx`;
ALTER TABLE `accountingproduct` DROP INDEX `accountingproduct_salesTax2Id_idx`;

-- Drop product tax columns
ALTER TABLE `accountingproduct`
  DROP COLUMN `purchaseTax1Id`,
  DROP COLUMN `purchaseTax2Id`,
  DROP COLUMN `salesTax1Id`,
  DROP COLUMN `salesTax2Id`;

-- Drop per-line tax columns from PO line (taxes now live on PO header)
ALTER TABLE `accountingpurchaseorderline`
  DROP COLUMN `tax1Code`,
  DROP COLUMN `tax1Name`,
  DROP COLUMN `tax1Rate`,
  DROP COLUMN `tax1Method`,
  DROP COLUMN `tax1Amount`,
  DROP COLUMN `tax2Code`,
  DROP COLUMN `tax2Name`,
  DROP COLUMN `tax2Rate`,
  DROP COLUMN `tax2Method`,
  DROP COLUMN `tax2Amount`;

-- Add PO header tax snapshot columns (applied sequentially: tax1 on subtotal-discount, tax2 on subtotal-discount+tax1)
ALTER TABLE `accountingpurchaseorder`
  ADD COLUMN `tax1Code` VARCHAR(30) NULL,
  ADD COLUMN `tax1Name` VARCHAR(100) NULL,
  ADD COLUMN `tax1Rate` DECIMAL(14, 4) NULL,
  ADD COLUMN `tax1Method` VARCHAR(20) NULL,
  ADD COLUMN `tax1Amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN `tax2Code` VARCHAR(30) NULL,
  ADD COLUMN `tax2Name` VARCHAR(100) NULL,
  ADD COLUMN `tax2Rate` DECIMAL(14, 4) NULL,
  ADD COLUMN `tax2Method` VARCHAR(20) NULL,
  ADD COLUMN `tax2Amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;
