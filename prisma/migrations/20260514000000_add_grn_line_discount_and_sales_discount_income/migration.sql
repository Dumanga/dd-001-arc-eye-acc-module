-- Adds GRN line-level discount support per accounting-theories.md § 1.1.
-- Two changes:
--   1. accountinggoodsreceiptline.discount — flat-amount line discount, defaults to 0 so
--      existing rows are preserved as "no discount" without backfill.
--   2. accountingsystemaccount.key — extend the enum to include SALES_DISCOUNT_INCOME, the
--      system-account key the GRN posting service resolves to IOOI002 SALES DISCOUNT INCOME.

ALTER TABLE `accountinggoodsreceiptline`
  ADD COLUMN `discount` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000;

ALTER TABLE `accountingsystemaccount`
  MODIFY COLUMN `key` ENUM(
    'SUPPLIER_PAYABLE',
    'DEBTOR_RECEIVABLE',
    'PRODUCTION_INVENTORY',
    'CASH_ON_HAND',
    'SSCL_TAX_PAYABLE',
    'VAT_PAYABLE',
    'PRODUCT_INCOME',
    'CASH_DISCOUNT_INCOME',
    'SALES_DISCOUNT_INCOME',
    'COST_OF_GOODS_SOLD',
    'SALES_DISCOUNT_EXPENSE',
    'CASH_DISCOUNT_EXPENSE'
  ) NOT NULL;
