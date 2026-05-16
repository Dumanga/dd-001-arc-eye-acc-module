import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type InvoiceDetailLine = {
  id: string;
  lineOrder: number;
  productCode: string;
  productName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  uomName: string;
  uomBase: string;
  // The serial number of the specific unit sold, when the product is
  // serial-tracked. Null for non-serial lines. Renders under the
  // product name on the printed/displayed invoice.
  productSerialNumber: string | null;
};

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  statusLabel: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  customerRef: string;
  billedBy: string;
  notes: string;
  terms: string;
  discount: string;
  subtotal: string;
  total: string;
  createdAt: string;
  approvedAt: string | null;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    currency: string;
  };
  lines: InvoiceDetailLine[];
  createdByName: string;
  approvedByName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const invoice = await prisma.accountingInvoice.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, mobile: true, email: true, address: true, currency: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            product: { select: { code: true, salesName: true, purchaseName: true } },
            productSerial: { select: { serialNumber: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(fail("Invoice not found.", "NOT_FOUND"), { status: 404 });
    }

    const lines: InvoiceDetailLine[] = invoice.lines.map((line) => {
      const productName =
        line.itemName || line.product.salesName || line.product.purchaseName || line.product.code;
      return {
        id: line.id,
        lineOrder: line.lineOrder,
        productCode: line.itemCode || line.product.code,
        productName,
        description: line.description,
        quantity: Number(line.quantity).toString(),
        unitPrice: Number(line.unitPrice).toFixed(2),
        discount: Number(line.discount).toFixed(2),
        lineTotal: Number(line.lineTotal).toFixed(2),
        uomName: line.uomName,
        uomBase: line.uomBase,
        productSerialNumber: line.productSerial?.serialNumber ?? null,
      };
    });

    const detail: InvoiceDetail = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      statusLabel: STATUS_LABELS[invoice.status] ?? invoice.status,
      currency: invoice.currency,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      customerRef: invoice.customerRef,
      billedBy: invoice.billedBy,
      notes: invoice.notes,
      terms: invoice.terms,
      discount: Number(invoice.discount).toFixed(2),
      subtotal: Number(invoice.subtotal).toFixed(2),
      total: Number(invoice.total).toFixed(2),
      createdAt: invoice.createdAt.toISOString(),
      approvedAt: invoice.approvedAt?.toISOString() ?? null,
      customer: {
        id: invoice.customer.id,
        name: invoice.customer.name,
        mobile: invoice.customer.mobile,
        email: invoice.customer.email ?? "",
        address: invoice.customer.address ?? "",
        currency: invoice.customer.currency,
      },
      lines,
      createdByName: invoice.createdBy.displayName,
      approvedByName: invoice.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(ok({ invoice: detail }, "Invoice detail fetched."), { status: 200 });
  } catch (err) {
    console.error("[INV DETAIL]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
