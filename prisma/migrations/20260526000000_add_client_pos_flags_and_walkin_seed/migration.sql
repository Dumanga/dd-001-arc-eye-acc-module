-- Adds POS classification flags to AccountingClient and seeds the single
-- walk-in customer row required by the POS bill flow.
--
-- See accounting-theories.md § 7 Customer Treatment and
-- pos-integration-flow.md § 3.5 / § 3.6 / § 3.7.
--
-- Why two flags:
--   • isMerchant — true for Visa / MasterCard / Koko / bank settlement
--     counterparties used by SPLIT-method POS bills. They appear only in
--     the SPLIT merchant picker, never in the top-level POS customer
--     dropdown.
--   • isWalkIn  — true on exactly ONE seeded row that represents all
--     anonymous POS bills. Required so AAR / customer-ledger rows on
--     anonymous bills have a real customerId to attach to (the
--     integrity invariant requires a customerId on every receivable
--     row). Filtered out of regular customer-management UIs.
--
-- The two flags are mutually exclusive — a row may be at most one of
-- merchant / walk-in / regular (both flags false). Application-level
-- validation enforces this; the migration does not add a CHECK
-- constraint because MySQL versions in production may not enforce them.

ALTER TABLE `accountingclient`
  ADD COLUMN `isMerchant` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `isWalkIn`   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX `accountingclient_isMerchant_idx` ON `accountingclient`(`isMerchant`);
CREATE INDEX `accountingclient_isWalkIn_idx`   ON `accountingclient`(`isWalkIn`);

-- Seed the walk-in customer row. Mobile uses a sentinel `WALK-IN` so
-- it cannot collide with any real Sri Lankan mobile number (which all
-- start with `0` or `+94`). The row is never editable / deletable
-- through the UI — its lifecycle is managed by the system.
INSERT INTO `accountingclient`
  (`id`, `name`, `mobile`, `currency`, `tier`, `isMerchant`, `isWalkIn`, `createdAt`, `updatedAt`)
VALUES
  ('walk-in-customer', 'Walk-in Customer', 'WALK-IN', 'LKR', 'BRONZE', FALSE, TRUE, NOW(3), NOW(3));
