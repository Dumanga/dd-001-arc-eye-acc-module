-- Adds SALES_RETURN to the AccountingRemarkDocType enum so the
-- Settings → Document Remarks tab can manage a default note for the
-- customer-side return form (mirrors GOODS_RETURN on the supplier side).
--
-- Single ALTER MODIFY COLUMN expands the live enum without touching existing
-- rows. The new value is positioned next to GOODS_RETURN to match the
-- DOC_TYPE_ORDER used by the Settings UI.

ALTER TABLE `accountingremark`
  MODIFY COLUMN `documentType` ENUM(
    'PURCHASE_ORDER',
    'INVOICE',
    'QUOTATION',
    'GRN',
    'GOODS_RETURN',
    'SALES_RETURN',
    'RECEIPT',
    'POS_BILL',
    'SUPPLIER_PAYMENT'
  ) NOT NULL;
