import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type PoTaxSummary = {
  code: string;
  name: string;
  rate: string;
  method: string;
  amount: string;
  base: string;
};

export type PoDetail = {
  id: string;
  poNumber: string;
  status: string;
  statusLabel: string;
  supplierRef: string;
  buyerCode: string;
  poDate: string;
  expectedDate: string;
  currency: string;
  discount: string;
  notes: string;
  terms: string;
  createdAt: string;
  supplier: {
    id: string;
    code: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
  };
  lines: Array<{
    id: string;
    lineOrder: number;
    productCode: string;
    productName: string;
    description: string;
    quantity: string;
    unitPrice: string;
    uomName: string;
    uomBase: string;
    lineTotal: string;
  }>;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  taxBreakdown: PoTaxSummary[];
  grandTotal: string;
  createdByName: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent to supplier",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Fully received",
  CANCELLED: "Cancelled",
};

type EffectiveTax = {
  code: string;
  name: string;
  rate: number;
  method: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const po = await prisma.accountingPurchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: {
          include: {
            contactInfo: true,
            taxCodes: {
              orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
              include: {
                taxCode: {
                  select: {
                    code: true,
                    name: true,
                    rate: true,
                    calculation: true,
                    taxType: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        createdBy: { select: { displayName: true } },
        lines: {
          include: {
            product: { select: { code: true, purchaseName: true } },
          },
          orderBy: { lineOrder: "asc" },
        },
      },
    });

    if (!po) {
      return NextResponse.json(fail("Purchase order not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    // Resolve effective taxes:
    // - If PO has a snapshot (tax1Code set), use it.
    // - Otherwise, fall back to the supplier's current purchase tax codes
    //   so existing pre-feature POs immediately reflect tax.
    function snapshotFromHeader(): { tax1: EffectiveTax | null; tax2: EffectiveTax | null } {
      const tax1: EffectiveTax | null = po!.tax1Code && po!.tax1Method
        ? {
            code: po!.tax1Code,
            name: po!.tax1Name ?? po!.tax1Code,
            rate: Number(po!.tax1Rate ?? 0),
            method: po!.tax1Method,
          }
        : null;
      const tax2: EffectiveTax | null = po!.tax2Code && po!.tax2Method
        ? {
            code: po!.tax2Code,
            name: po!.tax2Name ?? po!.tax2Code,
            rate: Number(po!.tax2Rate ?? 0),
            method: po!.tax2Method,
          }
        : null;
      return { tax1, tax2 };
    }

    function snapshotFromSupplier(): { tax1: EffectiveTax | null; tax2: EffectiveTax | null } {
      const taxes = po!.supplier.taxCodes
        .filter(
          (link) =>
            link.taxCode.isActive &&
            (link.taxCode.taxType === "PURCHASE" || link.taxCode.taxType === "BOTH")
        )
        .slice(0, 2)
        .map<EffectiveTax>((link) => ({
          code: link.taxCode.code,
          name: link.taxCode.name,
          rate: Number(link.taxCode.rate),
          method: link.taxCode.calculation,
        }));
      return { tax1: taxes[0] ?? null, tax2: taxes[1] ?? null };
    }

    const headerSnap = snapshotFromHeader();
    const effective = headerSnap.tax1 || headerSnap.tax2 ? headerSnap : snapshotFromSupplier();

    const subtotal = po.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0
    );
    const discount = Number(po.discount);
    const afterDiscount = Math.max(0, subtotal - discount);

    function applyTax(base: number, tax: EffectiveTax | null) {
      if (!tax) return 0;
      if (tax.method === "PERCENTAGE") return (base * tax.rate) / 100;
      return tax.rate;
    }

    const tax1Amount = applyTax(afterDiscount, effective.tax1);
    const tax2Base = afterDiscount + tax1Amount;
    const tax2Amount = applyTax(tax2Base, effective.tax2);
    const totalTax = tax1Amount + tax2Amount;
    const grandTotal = afterDiscount + totalTax;

    const taxBreakdown: PoTaxSummary[] = [];
    if (effective.tax1) {
      taxBreakdown.push({
        code: effective.tax1.code,
        name: effective.tax1.name,
        rate: effective.tax1.rate.toString(),
        method: effective.tax1.method,
        amount: tax1Amount.toFixed(2),
        base: afterDiscount.toFixed(2),
      });
    }
    if (effective.tax2) {
      taxBreakdown.push({
        code: effective.tax2.code,
        name: effective.tax2.name,
        rate: effective.tax2.rate.toString(),
        method: effective.tax2.method,
        amount: tax2Amount.toFixed(2),
        base: tax2Base.toFixed(2),
      });
    }

    const detail: PoDetail = {
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      statusLabel: STATUS_LABELS[po.status] ?? po.status,
      supplierRef: po.supplierRef,
      buyerCode: po.buyerCode,
      poDate: po.poDate.toISOString().slice(0, 10),
      expectedDate: po.expectedDate.toISOString().slice(0, 10),
      currency: po.currency,
      discount: discount.toFixed(2),
      notes: po.notes,
      terms: po.terms,
      createdAt: po.createdAt.toISOString(),
      supplier: {
        id: po.supplier.id,
        code: po.supplier.code,
        name: po.supplier.name,
        email: po.supplier.email,
        phone: [
          po.supplier.primaryPhoneDialCode,
          po.supplier.primaryPhoneLocalNumber,
        ]
          .filter(Boolean)
          .join(" "),
        city: po.supplier.contactInfo?.city ?? "",
        country: po.supplier.contactInfo?.country ?? "",
        addressLine1: po.supplier.contactInfo?.addressLine1 ?? "",
        addressLine2: po.supplier.contactInfo?.addressLine2 ?? "",
      },
      lines: po.lines.map((l) => {
        const lineTotal = Number(l.quantity) * Number(l.unitPrice);
        return {
          id: l.id,
          lineOrder: l.lineOrder,
          productCode: l.product.code,
          productName: l.description || l.product.purchaseName || l.product.code,
          description: l.description,
          quantity: Number(l.quantity).toString(),
          unitPrice: Number(l.unitPrice).toFixed(2),
          uomName: l.uomName,
          uomBase: l.uomBase,
          lineTotal: lineTotal.toFixed(2),
        };
      }),
      subtotal: subtotal.toFixed(2),
      totalDiscount: discount.toFixed(2),
      totalTax: totalTax.toFixed(2),
      taxBreakdown,
      grandTotal: grandTotal.toFixed(2),
      createdByName: po.createdBy.displayName,
    };

    return NextResponse.json(ok({ po: detail }, "PO detail fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[PO DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
