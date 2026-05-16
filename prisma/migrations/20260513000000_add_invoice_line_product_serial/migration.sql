-- Add productSerialId FK on invoice lines so serial-tracked inventory
-- items can be sold via a regular invoice (not just POS). Same soft-lock
-- semantics as accountingposbillline.productSerialId (migration
-- 20260601000001) — any DRAFT or APPROVED invoice line referencing a
-- serial blocks that serial from being picked again. The serial picker
-- now considers both POS bill references AND invoice references when
-- computing the active list.

ALTER TABLE `accountinginvoiceline`
  ADD COLUMN `productSerialId` VARCHAR(191) NULL;

ALTER TABLE `accountinginvoiceline`
  ADD CONSTRAINT `accountinginvoiceline_productSerialId_fkey`
  FOREIGN KEY (`productSerialId`)
  REFERENCES `accountinggoodsreceiptlineserial`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `accountinginvoiceline_productSerialId_idx`
  ON `accountinginvoiceline`(`productSerialId`);
