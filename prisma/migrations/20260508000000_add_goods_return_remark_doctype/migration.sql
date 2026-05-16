-- Adds the GOODS_RETURN value to the AccountingRemarkDocType enum used by
-- the `accountingremark` table.
ALTER TABLE `accountingremark`
  MODIFY COLUMN `documentType` ENUM(
    'PURCHASE_ORDER',
    'INVOICE',
    'QUOTATION',
    'GRN',
    'GOODS_RETURN',
    'RECEIPT',
    'POS_BILL',
    'SUPPLIER_PAYMENT'
  ) NOT NULL;
