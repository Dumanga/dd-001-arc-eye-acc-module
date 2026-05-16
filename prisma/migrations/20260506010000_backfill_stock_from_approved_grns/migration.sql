UPDATE `accountingproduct` p
LEFT JOIN (
  SELECT
    gl.`productId`,
    SUM(gl.`receivedQty`) AS `approvedQty`
  FROM `accountinggoodsreceiptline` gl
  INNER JOIN `accountinggoodsreceipt` g
    ON g.`id` = gl.`goodsReceiptId`
   AND g.`status` = 'APPROVED'
  INNER JOIN `accountingproduct` gp
    ON gp.`id` = gl.`productId`
   AND gp.`itemType` = 'INVENTORY_ITEM'
  GROUP BY gl.`productId`
) approved_stock
  ON approved_stock.`productId` = p.`id`
SET p.`stockOnHand` = COALESCE(approved_stock.`approvedQty`, 0)
WHERE p.`itemType` = 'INVENTORY_ITEM';
