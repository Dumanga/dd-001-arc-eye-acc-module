-- Expand AccountingFormType enum on accountingformidconfig.formType to include QT
ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType` ENUM(
    'PO',
    'GRN',
    'GRR',
    'QT',
    'INV',
    'RC',
    'POS',
    'PV'
  ) NOT NULL;
