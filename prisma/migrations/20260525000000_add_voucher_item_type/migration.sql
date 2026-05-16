-- Adds VOUCHER to the AccountingProductItemType enum so gift vouchers can
-- be modelled as a dedicated item type with always-on serial tracking.
--
-- Why a new item type rather than reusing INVENTORY_ITEM:
--   • Vouchers come back to the shop on POS redemption (unlike normal stock
--     which only flows OUT). Knowing the item is a voucher lets the POS flow
--     branch its posting (settle deferred-revenue liability vs recognise
--     income).
--   • Voucher serial numbers carry a status lifecycle (ACTIVE → ISSUED →
--     REDEEMED). Encoding "this product is a voucher" at the type level
--     means the operator can never accidentally turn off serial tracking.
--   • Reports can slice voucher inventory + outstanding-voucher liability
--     from regular stock without joining to additional tables.
--
-- Single ALTER MODIFY COLUMN expands the live enum without touching existing
-- product rows.

ALTER TABLE `accountingproduct`
  MODIFY COLUMN `itemType` ENUM(
    'INVENTORY_ITEM',
    'SERVICE_ITEM',
    'GROUP_ITEM',
    'VOUCHER'
  ) NOT NULL;
