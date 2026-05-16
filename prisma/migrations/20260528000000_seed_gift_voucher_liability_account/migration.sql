-- Seeds the GIFT_VOUCHER_LIABILITY chart-of-accounts row (LFGV001),
-- so voucher products created from the product form have at least one
-- valid current-liability account to point their `incomeAccountId` at.
--
-- Per accounting-theories.md § 7.3: the voucher product's
-- `incomeAccountId` column points to a current-liability account
-- (deferred revenue) — not a real income account. The voucher
-- product form filters its income-account dropdown to
-- LIABILITIES / CURRENT_LIABILITIES type rows.
--
-- This seed does NOT add a new subtype — it reuses
-- OTHER_CURRENT_LIABILITIES, which is the natural bucket for
-- deferred revenue obligations like outstanding gift vouchers.

INSERT INTO `chartofaccounts`
  (`id`, `code`, `name`, `categoryId`, `typeId`, `subtypeId`, `currencyCode`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  'gift-voucher-liability',
  'LFGV001',
  'GIFT VOUCHER LIABILITY',
  cat.id,
  t.id,
  st.id,
  'LKR',
  TRUE,
  NOW(3),
  NOW(3)
FROM `accountingaccountcategory` cat
JOIN `accountingaccounttype` t ON t.categoryId = cat.id
JOIN `accountingaccountsubtype` st ON st.typeId = t.id
WHERE cat.code = 'LIABILITIES'
  AND t.code = 'CURRENT_LIABILITIES'
  AND st.code = 'OTHER_CURRENT_LIABILITIES'
LIMIT 1;
