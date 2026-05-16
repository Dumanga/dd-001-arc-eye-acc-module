-- Adds the REDEEM_VOUCHER tender method and a voucherSerialId column
-- on AccountingPosBillPayment, enabling the voucher-redemption flow
-- per accounting-theories.md § 7.4.
--
-- A REDEEM_VOUCHER row carries:
--   • method = REDEEM_VOUCHER
--   • cashAccountId = NULL
--   • merchantClientId = NULL
--   • voucherSerialId = <the serial being redeemed>
--   • amount = voucher's face value
--
-- Posting (per theory § 7.4): debit the voucher product's
-- incomeAccountId (which points to a current-liability account, set
-- when the voucher was sold) — clears the deferred-revenue liability.

ALTER TABLE `accountingposbillpayment`
  MODIFY COLUMN `method` ENUM('CASH', 'CARD', 'SPLIT', 'REDEEM_VOUCHER') NOT NULL,
  ADD COLUMN `voucherSerialId` VARCHAR(191) NULL;

CREATE INDEX `accountingposbillpayment_voucherSerialId_idx`
  ON `accountingposbillpayment`(`voucherSerialId`);

ALTER TABLE `accountingposbillpayment`
  ADD CONSTRAINT `accountingposbillpayment_voucherSerialId_fkey`
    FOREIGN KEY (`voucherSerialId`) REFERENCES `accountinggoodsreceiptlineserial`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
