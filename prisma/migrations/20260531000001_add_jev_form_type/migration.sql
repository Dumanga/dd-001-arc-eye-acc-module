-- Adds JEV (Journal Entry Voucher) to the AccountingFormType enum so that
-- the Form ID Config screen can manage the JEV series and the journal entry
-- screen can load the next voucher number from the config.

ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType` ENUM('PO','GRN','GRR','QT','INV','SR','RC','POS','PV','EXP','JEV') NOT NULL;
