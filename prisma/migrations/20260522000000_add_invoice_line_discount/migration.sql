-- Adds per-line discount to invoice lines, replacing the previously-used
-- single header discount field on the invoice.
--
-- The header `accountinginvoice.discount` column stays in place — the create
-- API now populates it as `SUM(accountinginvoiceline.discount)` so:
--   • the existing posting helper (which reads invoice.discount for JE 3)
--     keeps working with no code change
--   • approved invoices that were posted before this change (with header
--     discount only and zero line discount) keep reading correctly
--   • reports that already read invoice.discount don't break
--
-- See accounting-theories.md § 4.1 for the discount posting rules.

ALTER TABLE `accountinginvoiceline`
  ADD COLUMN `discount` DECIMAL(18, 4) NOT NULL DEFAULT 0 AFTER `unitPrice`;
