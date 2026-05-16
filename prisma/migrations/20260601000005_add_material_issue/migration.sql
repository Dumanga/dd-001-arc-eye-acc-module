-- Material Issue Note (MIN) per accounting-theories.md §10. Records inventory
-- leaving the warehouse for internal consumption (repairs, maintenance,
-- samples, write-offs). Cost is charged to a header-level expense account;
-- inventory is credited at lifetime weighted-average cost. No sub-ledger.

-- 1) Extend form-type enum so the form-id config can issue MIN-YYYY-NNNNN
--    voucher numbers.
ALTER TABLE `accountingformidconfig`
  MODIFY COLUMN `formType`
    ENUM('PO','GRN','GRR','QT','INV','SR','RC','POS','PV','EXP','JEV','MIN') NOT NULL;

-- 2) Extend journal doc-type enum so GL rows can carry documentType=MIN.
ALTER TABLE `accountingjournalentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV','MIN') NOT NULL;
ALTER TABLE `accountingsupplierledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV','MIN') NOT NULL;
ALTER TABLE `accountingcustomerledgerentry`
  MODIFY COLUMN `documentType`
    ENUM('GRN','GRR','PV','INV','SR','RC','POS','JE','IBT','EXP','JEV','MIN') NOT NULL;

-- 3) Create the issue header table.
CREATE TABLE `accountingmaterialissue` (
  `id`               VARCHAR(191) NOT NULL,
  `issueNumber`      VARCHAR(50)  NOT NULL,
  `storeId`          VARCHAR(191) NOT NULL,
  `expenseAccountId` VARCHAR(191) NOT NULL,
  `issueDate`        DATE NOT NULL,
  `currency`         VARCHAR(10) NOT NULL DEFAULT 'LKR',
  `requestedBy`      VARCHAR(150) NOT NULL DEFAULT '',
  `purpose`          VARCHAR(500) NOT NULL DEFAULT '',
  `total`            DECIMAL(18,4) NOT NULL DEFAULT 0,
  `notes`            TEXT NOT NULL,
  `status`           ENUM('DRAFT','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `createdById`      VARCHAR(191) NOT NULL,
  `approvedById`     VARCHAR(191) NULL,
  `approvedAt`       DATETIME(3) NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,

  UNIQUE INDEX `accountingmaterialissue_issueNumber_key`(`issueNumber`),
  INDEX `accountingmaterialissue_storeId_idx`(`storeId`),
  INDEX `accountingmaterialissue_expenseAccountId_idx`(`expenseAccountId`),
  INDEX `accountingmaterialissue_createdById_idx`(`createdById`),
  INDEX `accountingmaterialissue_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `accountingmaterialissue_issueDate_idx`(`issueDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) Create the line table.
CREATE TABLE `accountingmaterialissueline` (
  `id`              VARCHAR(191) NOT NULL,
  `materialIssueId` VARCHAR(191) NOT NULL,
  `productId`       VARCHAR(191) NOT NULL,
  `itemCode`        VARCHAR(60) NOT NULL,
  `itemName`        VARCHAR(200) NOT NULL,
  `description`     VARCHAR(500) NOT NULL DEFAULT '',
  `quantity`        DECIMAL(18,4) NOT NULL,
  `unitCost`        DECIMAL(18,4) NOT NULL DEFAULT 0,
  `lineValue`       DECIMAL(18,4) NOT NULL DEFAULT 0,
  `uomName`         VARCHAR(100) NOT NULL DEFAULT '',
  `uomBase`         VARCHAR(100) NOT NULL DEFAULT '',
  `notes`           VARCHAR(500) NOT NULL DEFAULT '',
  `lineOrder`       INT NOT NULL DEFAULT 0,
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `accountingmaterialissueline_materialIssueId_lineOrder_idx`(`materialIssueId`, `lineOrder`),
  INDEX `accountingmaterialissueline_productId_idx`(`productId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5) Foreign keys.
ALTER TABLE `accountingmaterialissue`
  ADD CONSTRAINT `accountingmaterialissue_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingmaterialissue_expenseAccountId_fkey`
    FOREIGN KEY (`expenseAccountId`) REFERENCES `chartofaccounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingmaterialissue_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `accountinguser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingmaterialissue_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `accountinguser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `accountingmaterialissueline`
  ADD CONSTRAINT `accountingmaterialissueline_materialIssueId_fkey`
    FOREIGN KEY (`materialIssueId`) REFERENCES `accountingmaterialissue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `accountingmaterialissueline_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `accountingproduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
