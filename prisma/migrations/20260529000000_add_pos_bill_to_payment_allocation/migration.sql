-- Adds `posBillId` to AccountingCustomerPaymentAllocation so a CPR
-- can settle SPLIT POS bills the same way it settles invoices. Per
-- accounting-theories.md § 7.2 — when the merchant transfer lands,
-- the operator records a CPR against the merchant and allocates it
-- to one or more open SPLIT POS bills.
--
-- Existing rows have invoiceId set; new POS-bill allocations will
-- have posBillId set instead. Application validation ensures exactly
-- one of the two is set per row.

ALTER TABLE `accountingcustomerpaymentallocation`
  ADD COLUMN `posBillId` VARCHAR(191) NULL;

CREATE INDEX `accountingcustomerpaymentallocation_posBillId_idx`
  ON `accountingcustomerpaymentallocation`(`posBillId`);

ALTER TABLE `accountingcustomerpaymentallocation`
  ADD CONSTRAINT `accountingcustomerpaymentallocation_posBillId_fkey`
    FOREIGN KEY (`posBillId`) REFERENCES `accountingposbill`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
