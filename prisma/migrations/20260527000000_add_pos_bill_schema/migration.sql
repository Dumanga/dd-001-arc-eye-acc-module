-- POS bill schema — single consolidated entity per accounting-theories.md § 7
-- POS Schema Implications and pos-integration-flow.md § 4.2.
--
-- One bill table, status-discriminated:
--   DRAFT, isHeld=false  → live cart
--   DRAFT, isHeld=true   → held bill
--   COMPLETED            → posted (cash/card/mixed settled, split pending)
--   CANCELLED            → abandoned (auto-expired) or user-deleted
--
-- Stock reservation, hold persistence, and bill-number burning all flow
-- from this single entity (no separate Cart table).
--
-- Also extends AccountingCustomerReturn with sourceType +
-- sourcePosBillId (and sourcePosBillLineId on lines) so SPLIT POS bills
-- can be returned through the same Customer Return module as invoices,
-- per theory § 7 Returns.

-- ─── AccountingPosBill ──────────────────────────────────────────────
CREATE TABLE `accountingposbill` (
  `id`                   VARCHAR(191) NOT NULL,
  `billNo`               VARCHAR(50)  NOT NULL,
  `status`               ENUM('DRAFT', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `isHeld`               BOOLEAN NOT NULL DEFAULT FALSE,
  `storeId`              VARCHAR(191) NOT NULL,
  `cashierId`            VARCHAR(191) NOT NULL,
  `customerId`           VARCHAR(191) NOT NULL,
  `merchantClientId`     VARCHAR(191) NULL,
  `paymentMethod`        ENUM('CASH', 'CARD', 'MIXED', 'SPLIT') NULL,
  `primaryCashAccountId` VARCHAR(191) NULL,
  `subtotal`             DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `totalDiscount`        DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `total`                DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `postedAt`             DATETIME(3) NULL,
  `postingId`            VARCHAR(191) NULL,
  `cancelledAt`          DATETIME(3) NULL,
  `cancelReason`         VARCHAR(80) NULL,
  `heldAt`               DATETIME(3) NULL,
  `heldNote`             VARCHAR(200) NULL,
  `lastActivityAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes`                TEXT NOT NULL,
  `createdAt`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`            DATETIME(3) NOT NULL,

  UNIQUE INDEX `accountingposbill_billNo_key` (`billNo`),
  INDEX `accountingposbill_storeId_idx` (`storeId`),
  INDEX `accountingposbill_cashierId_idx` (`cashierId`),
  INDEX `accountingposbill_customerId_idx` (`customerId`),
  INDEX `accountingposbill_merchantClientId_idx` (`merchantClientId`),
  INDEX `accountingposbill_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `accountingposbill_status_isHeld_lastActivityAt_idx` (`status`, `isHeld`, `lastActivityAt`),
  INDEX `accountingposbill_postedAt_idx` (`postedAt`),

  PRIMARY KEY (`id`),
  CONSTRAINT `accountingposbill_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbill_cashierId_fkey` FOREIGN KEY (`cashierId`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbill_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbill_merchantClientId_fkey` FOREIGN KEY (`merchantClientId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbill_primaryCashAccountId_fkey` FOREIGN KEY (`primaryCashAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── AccountingPosBillLine ──────────────────────────────────────────
CREATE TABLE `accountingposbillline` (
  `id`              VARCHAR(191) NOT NULL,
  `billId`          VARCHAR(191) NOT NULL,
  `productId`       VARCHAR(191) NOT NULL,
  `itemCode`        VARCHAR(60)  NOT NULL,
  `itemName`        VARCHAR(200) NOT NULL,
  `description`     VARCHAR(500) NOT NULL DEFAULT '',
  `quantity`        DECIMAL(18, 4) NOT NULL,
  `unitPrice`       DECIMAL(18, 4) NOT NULL,
  `discount`        DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `lineTotal`       DECIMAL(18, 4) NOT NULL,
  `uomName`         VARCHAR(100) NOT NULL DEFAULT '',
  `uomBase`         VARCHAR(100) NOT NULL DEFAULT '',
  `uomMinQty`       DECIMAL(18, 4) NOT NULL DEFAULT 1,
  `voucherSerialId` VARCHAR(191) NULL,
  `lineOrder`       INT NOT NULL DEFAULT 0,
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `accountingposbillline_billId_lineOrder_idx` (`billId`, `lineOrder`),
  INDEX `accountingposbillline_productId_idx` (`productId`),
  INDEX `accountingposbillline_voucherSerialId_idx` (`voucherSerialId`),

  PRIMARY KEY (`id`),
  CONSTRAINT `accountingposbillline_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `accountingposbill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `accountingposbillline_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbillline_voucherSerialId_fkey` FOREIGN KEY (`voucherSerialId`) REFERENCES `accountinggoodsreceiptlineserial`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── AccountingPosBillPayment ──────────────────────────────────────
-- Tender rows. MIXED bills have two CASH (or CASH+CARD) rows with
-- different cashAccountIds; sum across rows must equal bill.total.
-- REDEEM_VOUCHER tender method will be added in the voucher-redemption
-- phase per theory § 7.4.
CREATE TABLE `accountingposbillpayment` (
  `id`               VARCHAR(191) NOT NULL,
  `billId`           VARCHAR(191) NOT NULL,
  `method`           ENUM('CASH', 'CARD', 'SPLIT') NOT NULL,
  `cashAccountId`    VARCHAR(191) NULL,
  `merchantClientId` VARCHAR(191) NULL,
  `amount`           DECIMAL(18, 4) NOT NULL,
  `rowOrder`         INT NOT NULL DEFAULT 0,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `accountingposbillpayment_billId_rowOrder_idx` (`billId`, `rowOrder`),
  INDEX `accountingposbillpayment_cashAccountId_idx` (`cashAccountId`),
  INDEX `accountingposbillpayment_merchantClientId_idx` (`merchantClientId`),

  PRIMARY KEY (`id`),
  CONSTRAINT `accountingposbillpayment_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `accountingposbill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `accountingposbillpayment_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `accountingposbillpayment_merchantClientId_fkey` FOREIGN KEY (`merchantClientId`) REFERENCES `accountingclient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── AccountingCustomerReturn extension for POS bill returns ────────
-- Existing rows default to sourceType=INVOICE so they keep working
-- unchanged. New POS_BILL returns set sourcePosBillId and leave
-- invoiceId NULL.
ALTER TABLE `accountingcustomerreturn`
  ADD COLUMN `sourceType`      ENUM('INVOICE', 'POS_BILL') NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN `sourcePosBillId` VARCHAR(191) NULL,
  MODIFY COLUMN `invoiceId`    VARCHAR(191) NULL;

CREATE INDEX `accountingcustomerreturn_sourcePosBillId_idx`
  ON `accountingcustomerreturn`(`sourcePosBillId`);
CREATE INDEX `accountingcustomerreturn_sourceType_idx`
  ON `accountingcustomerreturn`(`sourceType`);

ALTER TABLE `accountingcustomerreturn`
  ADD CONSTRAINT `accountingcustomerreturn_sourcePosBillId_fkey`
    FOREIGN KEY (`sourcePosBillId`) REFERENCES `accountingposbill`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── AccountingCustomerReturnLine extension for POS bill lines ──────
ALTER TABLE `accountingcustomerreturnline`
  ADD COLUMN `sourcePosBillLineId` VARCHAR(191) NULL,
  MODIFY COLUMN `invoiceLineId`    VARCHAR(191) NULL;

CREATE INDEX `accountingcustomerreturnline_sourcePosBillLineId_idx`
  ON `accountingcustomerreturnline`(`sourcePosBillLineId`);

ALTER TABLE `accountingcustomerreturnline`
  ADD CONSTRAINT `accountingcustomerreturnline_sourcePosBillLineId_fkey`
    FOREIGN KEY (`sourcePosBillLineId`) REFERENCES `accountingposbillline`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
