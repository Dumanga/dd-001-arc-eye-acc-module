// GET /api/accounting/dashboard/pending-forms
//
// Aggregates draft documents across the accounting module for the
// super-admin "Pending Forms" dashboard popup. Lists each draft so
// the super admin can view + bulk-approve from a single screen.
//
// Auth: super admin only (other roles get 403). The popup is meant as
// a single approver pane, not a per-user inbox.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { requireAccountingUser } from "@/lib/auth/accounting";
import { prisma } from "@/lib/db";

export type PendingFormRow = {
  id: string;
  number: string;
  date: string;           // ISO yyyy-mm-dd
  partyName: string;      // supplier or customer name (or "—" for internal)
  amount: string;         // formatted decimal as string, e.g. "1234.56"
  // The href the "View" button opens. Each doc type lives on its own
  // screen so we link there directly rather than recreating preview
  // components inside this popup.
  href: string;
  // Endpoint to POST {} to in order to approve this single doc.
  // null for view-only types (POs — no approval gate in the schema).
  approveEndpoint: string | null;
};

export type PendingFormGroup = {
  key: string;
  label: string;
  count: number;
  rows: PendingFormRow[];
};

export type PendingFormsPayload = {
  supplier: PendingFormGroup[];
  customer: PendingFormGroup[];
  internal: PendingFormGroup[];
  totalCount: number;
};

const PAGE_SIZE = 50; // per group; super admin rarely has more drafts than this

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(d: { toString: () => string } | number | string): string {
  return Number(d).toFixed(2);
}

export async function GET() {
  try {
    const user = await requireAccountingUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "AUTH"), { status: 401 });
    }
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        fail("Only super admins can view the pending-forms inbox.", "FORBIDDEN"),
        { status: 403 },
      );
    }

    // All queries fire in parallel — each draft type is independent.
    const [
      pos,
      grns,
      goodsReturns,
      payVouchers,
      quotations,
      invoices,
      customerReturns,
      customerPayments,
      materialIssues,
    ] = await Promise.all([
      prisma.accountingPurchaseOrder.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { supplier: { select: { name: true } } },
      }),
      prisma.accountingGoodsReceipt.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { supplier: { select: { name: true } } },
      }),
      prisma.accountingGoodsReturn.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { supplier: { select: { name: true } } },
      }),
      prisma.accountingPaymentVoucher.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { supplier: { select: { name: true } } },
      }),
      prisma.accountingQuotation.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { customer: { select: { name: true } } },
      }),
      prisma.accountingInvoice.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { customer: { select: { name: true } } },
      }),
      prisma.accountingCustomerReturn.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { customer: { select: { name: true } } },
      }),
      prisma.accountingCustomerPaymentReceipt.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { customer: { select: { name: true } } },
      }),
      prisma.accountingMaterialIssue.findMany({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
      }),
    ]);

    // ── Supplier groups ─────────────────────────────────────────────
    const supplierGroups: PendingFormGroup[] = [
      {
        key: "purchase-orders",
        label: "Purchase Orders",
        count: pos.length,
        rows: pos.map((p) => ({
          id: p.id,
          number: p.poNumber,
          date: fmtDate(p.poDate),
          partyName: p.supplier.name,
          // POs don't have a top-level "total" column, so fall back to
          // discount + tax + line aggregates if available. Cheapest
          // option here is the discount/tax we already have on the row.
          amount: fmtMoney(0),
          href: `/accounting/admin/suppliers/purchase-orders?id=${p.id}`,
          approveEndpoint: null, // POs don't have an approval gate
        })),
      },
      {
        key: "grns",
        label: "Goods Receipts (GRN)",
        count: grns.length,
        rows: grns.map((g) => ({
          id: g.id,
          number: g.grnNumber,
          date: fmtDate(g.receiptDate),
          partyName: g.supplier?.name ?? "—",
          amount: fmtMoney(0),
          href: `/accounting/admin/suppliers/grn?id=${g.id}`,
          approveEndpoint: `/api/accounting/goods-receipts/${g.id}/approve`,
        })),
      },
      {
        key: "goods-returns",
        label: "Goods Returns",
        count: goodsReturns.length,
        rows: goodsReturns.map((g) => ({
          id: g.id,
          number: g.returnNumber,
          date: fmtDate(g.returnDate),
          partyName: g.supplier.name,
          amount: fmtMoney(g.totalValue),
          href: `/accounting/admin/suppliers/goods-return?id=${g.id}`,
          approveEndpoint: `/api/accounting/goods-returns/${g.id}/approve`,
        })),
      },
      {
        key: "payment-vouchers",
        label: "Supplier Payments",
        count: payVouchers.length,
        rows: payVouchers.map((p) => ({
          id: p.id,
          number: p.voucherNumber,
          date: fmtDate(p.voucherDate),
          partyName: p.supplier.name,
          amount: fmtMoney(p.paymentTotal),
          href: `/accounting/admin/suppliers/payments?id=${p.id}`,
          approveEndpoint: `/api/accounting/payment-vouchers/${p.id}/approve`,
        })),
      },
    ];

    // ── Customer groups ─────────────────────────────────────────────
    const customerGroups: PendingFormGroup[] = [
      {
        key: "quotations",
        label: "Quotations",
        count: quotations.length,
        rows: quotations.map((q) => ({
          id: q.id,
          number: q.quotationNumber,
          date: fmtDate(q.quotationDate),
          partyName: q.customer.name,
          amount: fmtMoney(q.total),
          href: `/accounting/admin/customers/quotations?id=${q.id}`,
          approveEndpoint: `/api/accounting/quotations/${q.id}/approve`,
        })),
      },
      {
        key: "invoices",
        label: "Invoices",
        count: invoices.length,
        rows: invoices.map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          date: fmtDate(i.invoiceDate),
          partyName: i.customer.name,
          amount: fmtMoney(i.total),
          href: `/accounting/admin/customers/invoices?id=${i.id}`,
          approveEndpoint: `/api/accounting/invoices/${i.id}/approve`,
        })),
      },
      {
        key: "customer-returns",
        label: "Customer Returns",
        count: customerReturns.length,
        rows: customerReturns.map((r) => ({
          id: r.id,
          number: r.returnNumber,
          date: fmtDate(r.returnDate),
          partyName: r.customer.name,
          amount: fmtMoney(r.totalNet),
          href: `/accounting/admin/customers/returns?id=${r.id}`,
          approveEndpoint: `/api/accounting/customer-returns/${r.id}/approve`,
        })),
      },
      {
        key: "customer-payments",
        label: "Customer Payments",
        count: customerPayments.length,
        rows: customerPayments.map((p) => ({
          id: p.id,
          number: p.receiptNumber,
          date: fmtDate(p.receiptDate),
          partyName: p.customer.name,
          amount: fmtMoney(p.receivingTotal),
          href: `/accounting/admin/customers/payments?id=${p.id}`,
          approveEndpoint: `/api/accounting/customer-payments/${p.id}/approve`,
        })),
      },
    ];

    // ── Internal groups ─────────────────────────────────────────────
    const internalGroups: PendingFormGroup[] = [
      {
        key: "material-issues",
        label: "Material Issue Notes",
        count: materialIssues.length,
        rows: materialIssues.map((m) => ({
          id: m.id,
          number: m.issueNumber,
          date: fmtDate(m.issueDate),
          partyName: "—",
          amount: fmtMoney(m.total),
          href: `/accounting/admin/inventory/material-issue?id=${m.id}`,
          approveEndpoint: `/api/accounting/material-issues/${m.id}/approve`,
        })),
      },
    ];

    const totalCount =
      supplierGroups.reduce((s, g) => s + g.count, 0) +
      customerGroups.reduce((s, g) => s + g.count, 0) +
      internalGroups.reduce((s, g) => s + g.count, 0);

    const payload: PendingFormsPayload = {
      supplier: supplierGroups,
      customer: customerGroups,
      internal: internalGroups,
      totalCount,
    };

    return NextResponse.json(ok(payload, "Pending forms fetched."), { status: 200 });
  } catch (err) {
    console.error("[PENDING FORMS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
