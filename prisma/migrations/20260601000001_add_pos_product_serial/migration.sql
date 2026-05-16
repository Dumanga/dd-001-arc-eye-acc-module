-- Add productSerialId FK on POS bill lines so non-voucher serial-tracked
-- products can be sold with a chosen serial number. Same soft-lock semantics
-- as voucherSerialId — any DRAFT or COMPLETED bill line that references a
-- serial blocks that serial from being picked again.

ALTER TABLE `accountingposbillline`
  ADD COLUMN `productSerialId` VARCHAR(191) NULL;

ALTER TABLE `accountingposbillline`
  ADD CONSTRAINT `accountingposbillline_productSerialId_fkey`
  FOREIGN KEY (`productSerialId`)
  REFERENCES `accountinggoodsreceiptlineserial`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `accountingposbillline_productSerialId_idx`
  ON `accountingposbillline`(`productSerialId`);
