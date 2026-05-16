import type { AccountingRemarkDocType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type RemarkItem = {
  documentType: AccountingRemarkDocType;
  label: string;
  content: string;
};

const DOC_TYPE_LABELS: Record<AccountingRemarkDocType, string> = {
  PURCHASE_ORDER:    "Purchase Order Remark",
  INVOICE:           "Invoice Remark",
  QUOTATION:         "Quotation Remark",
  GRN:               "GRN Remark",
  GOODS_RETURN:      "Goods Return Remark",
  SALES_RETURN:      "Sales Return Remark",
  RECEIPT:           "Receipt Remark",
  POS_BILL:          "POS Bill Remark",
  SUPPLIER_PAYMENT:  "Supplier Payment Remark",
  MATERIAL_ISSUE:    "Material Issue Remark",
};

const DOC_TYPE_ORDER: AccountingRemarkDocType[] = [
  "PURCHASE_ORDER",
  "INVOICE",
  "QUOTATION",
  "GRN",
  "GOODS_RETURN",
  "SALES_RETURN",
  "RECEIPT",
  "POS_BILL",
  "SUPPLIER_PAYMENT",
  "MATERIAL_ISSUE",
];

const DEFAULTS: Record<AccountingRemarkDocType, string> = {
  PURCHASE_ORDER:   "Goods should be delivered according to the agreed branch schedule. Price changes require prior approval.",
  INVOICE:          "Please settle the invoice within the agreed credit period. Thank you for your business.",
  QUOTATION:        "Quotation valid for 7 days. Product availability is subject to branch stock at confirmation time.",
  GRN:              "Received quantities should be verified against the supplier delivery note before posting the GRN.",
  GOODS_RETURN:     "Returned goods must be inspected against the linked GRN and supplier credit note before posting the return.",
  SALES_RETURN:     "Returned items must be inspected against the linked invoice before posting the return. Only the unpaid portion of the invoice is returnable.",
  RECEIPT:          "Payments received are subject to bank realization where applicable and should match the issued receipt reference.",
  POS_BILL:         "Items sold through the counter are exchangeable only with the original POS bill and within the approved period.",
  SUPPLIER_PAYMENT: "Supplier payments must be matched against approved vouchers and supporting supplier documents before release.",
  MATERIAL_ISSUE:   "Items issued for internal use must be approved before stock is moved out of the branch. Capture the receiving department and the purpose so consumption can be reconciled.",
};

export async function getRemarks(): Promise<RemarkItem[]> {
  const rows = await prisma.accountingRemark.findMany();
  const byType = new Map(rows.map((row) => [row.documentType, row]));

  return DOC_TYPE_ORDER.map((documentType) => ({
    documentType,
    label: DOC_TYPE_LABELS[documentType],
    content: byType.get(documentType)?.content ?? DEFAULTS[documentType],
  }));
}

export async function getRemark(documentType: AccountingRemarkDocType): Promise<RemarkItem> {
  const row = await prisma.accountingRemark.findUnique({ where: { documentType } });

  return {
    documentType,
    label: DOC_TYPE_LABELS[documentType],
    content: row?.content ?? DEFAULTS[documentType],
  };
}

export async function upsertRemark(documentType: AccountingRemarkDocType, content: string): Promise<RemarkItem> {
  const row = await prisma.accountingRemark.upsert({
    where: { documentType },
    create: { documentType, content: content.trim() },
    update: { content: content.trim() },
  });

  return {
    documentType: row.documentType,
    label: DOC_TYPE_LABELS[row.documentType],
    content: row.content,
  };
}
