-- Adds MATERIAL_ISSUE to the AccountingRemarkDocType enum so the
-- Settings → Document Remarks tab can manage a default note for the
-- material issue (stock movement) form.
--
-- Single ALTER MODIFY COLUMN expands the live enum without touching existing
-- rows. The new value is positioned at the end of the enum (matches the
-- order DOC_TYPE_ORDER used by the Settings UI — Material Issue card sits
-- after the supplier/customer document remarks).

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
    'SUPPLIER_PAYMENT',
    'MATERIAL_ISSUE'
  ) NOT NULL;
