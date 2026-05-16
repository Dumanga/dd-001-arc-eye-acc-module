-- Add opening-balance fields to GRN: a GRN can now be either a normal supplier
-- receipt (supplierId set, openingBalanceMode=false) or an opening-balance
-- receipt that lands stock against an equity account (supplierId NULL,
-- openingBalanceMode=true, openingEquityAccountId set). See
-- accounting-theories.md §1.2.

-- 1) Make supplierId nullable. We have to drop the existing FK first.
ALTER TABLE `accountinggoodsreceipt`
  DROP FOREIGN KEY `accountinggoodsreceipt_supplierId_fkey`;

ALTER TABLE `accountinggoodsreceipt`
  MODIFY COLUMN `supplierId` VARCHAR(191) NULL;

-- 2) Re-create the supplier FK so it allows NULL.
ALTER TABLE `accountinggoodsreceipt`
  ADD CONSTRAINT `accountinggoodsreceipt_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `accountingsupplier`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Add the two new columns.
ALTER TABLE `accountinggoodsreceipt`
  ADD COLUMN `openingBalanceMode` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `openingEquityAccountId` VARCHAR(191) NULL;

-- 4) FK on the equity account.
ALTER TABLE `accountinggoodsreceipt`
  ADD CONSTRAINT `accountinggoodsreceipt_openingEquityAccountId_fkey`
  FOREIGN KEY (`openingEquityAccountId`) REFERENCES `chartofaccounts`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Index for filtering / joining by equity account.
CREATE INDEX `accountinggoodsreceipt_openingEquityAccountId_idx`
  ON `accountinggoodsreceipt`(`openingEquityAccountId`);
