-- Adds EXP (Expense Voucher) to the AccountingFormType enum so that
-- the Form ID Config screen can manage the EXP series and the expense
-- voucher screen can load the next number from the config.

ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType` ENUM('PO','GRN','GRR','QT','INV','SR','RC','POS','PV','EXP') NOT NULL;
