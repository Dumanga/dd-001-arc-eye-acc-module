-- One-shot fixup: only the 4 system-account INSERTs from the
-- 20260517000000 migration. Run after the migration's CREATE TABLE
-- succeeded but the INSERTs hit the wrong table name (chartofaccount
-- vs chartofaccounts). Migration file has been corrected for fresh DBs.

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_debtor_receivable_v1', 'DEBTOR_RECEIVABLE', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'AAR001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_product_income_v1', 'PRODUCT_INCOME', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'PRIN0001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_cogs_v1', 'COST_OF_GOODS_SOLD', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'COGS0001';

INSERT INTO `accountingsystemaccount` (`id`, `key`, `accountId`, `updatedAt`)
SELECT 'sysacct_sales_discount_expense_v1', 'SALES_DISCOUNT_EXPENSE', `id`, NOW(3) FROM `chartofaccounts` WHERE `code` = 'EES001';
