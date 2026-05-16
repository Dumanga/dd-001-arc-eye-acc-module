import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { consumeProductStock, readBranchStock } from "@/lib/accounting/product-stock";
import { postInvoiceApproval } from "@/lib/accounting/invoice-posting";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const invoice = await prisma.accountingInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        storeId: true,
        lines: {
          select: { productId: true, quantity: true, itemName: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(fail("Invoice not found.", "NOT_FOUND"), { status: 404 });
    }
    if (invoice.status === "APPROVED") {
      return NextResponse.json(fail("Invoice is already approved.", "ALREADY_APPROVED"), { status: 409 });
    }
    if (invoice.status === "CANCELLED") {
      return NextResponse.json(fail("Cancelled invoices cannot be approved.", "INVALID_STATE"), { status: 409 });
    }

    // Pre-flight: verify each line has enough stock at the invoice's branch
    // before entering the transaction. The atomic check inside the
    // transaction catches a parallel sale that races us between this read
    // and the decrement.
    for (const line of invoice.lines) {
      const product = await prisma.accountingProduct.findUnique({
        where: { id: line.productId },
        select: { code: true, salesName: true },
      });
      if (!product) {
        return NextResponse.json(
          fail(`Product not found for line "${line.itemName}".`, "NOT_FOUND"),
          { status: 404 }
        );
      }
      const branchOnHand = await readBranchStock(prisma, {
        productId: line.productId,
        storeId: invoice.storeId,
      });
      if (branchOnHand < Number(line.quantity)) {
        return NextResponse.json(
          fail(
            `Insufficient stock at this branch for "${line.itemName}". Available: ${branchOnHand}, required: ${Number(line.quantity)}.`,
            "INSUFFICIENT_STOCK"
          ),
          { status: 409 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const statusUpdate = await tx.accountingInvoice.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "APPROVED", approvedById: currentUser.id, approvedAt },
      });

      if (statusUpdate.count !== 1) {
        throw new Error("INV_APPROVAL_STATE_CHANGED");
      }

      // Atomic per-branch decrement. Throws if a parallel sale drained the
      // branch's stock between the pre-flight read and now.
      for (const line of invoice.lines) {
        const ok = await consumeProductStock(tx, {
          productId: line.productId,
          storeId: invoice.storeId,
          qty: Number(line.quantity),
        });
        if (!ok) {
          throw new Error(`INV_STOCK_INSUFFICIENT:${line.itemName}`);
        }
      }

      // Post the double-entry GL + customer-ledger rows per
      // accounting-theories.md § 4 (and § 4.1 when a header discount is set).
      await postInvoiceApproval(tx, {
        invoiceId: id,
        createdById: currentUser.id,
      });

      const updated = await tx.accountingInvoice.findUniqueOrThrow({
        where: { id },
        select: { id: true, invoiceNumber: true },
      });

      return { updated };
    });

    return NextResponse.json(
      ok({ id: result.updated.id, invoiceNumber: result.updated.invoiceNumber }, "Invoice approved."),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "INV_APPROVAL_STATE_CHANGED") {
      return NextResponse.json(
        fail("Invoice approval state changed. Refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message.startsWith("INV_STOCK_INSUFFICIENT:")) {
      const item = err.message.split(":")[1];
      return NextResponse.json(
        fail(`Insufficient stock for "${item}" at time of approval.`, "INSUFFICIENT_STOCK"),
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message.startsWith("INV_NO_COST_BASIS:")) {
      const [, productCode, detail] = err.message.split(":");
      return NextResponse.json(
        fail(
          detail || `Cannot determine cost basis — no GRN history for product ${productCode}.`,
          "NO_COST_BASIS"
        ),
        { status: 422 }
      );
    }
    if (err instanceof Error && err.message.startsWith("INV_PRODUCT_ACCOUNTS_MISSING:")) {
      const [, productCode, detail] = err.message.split(":");
      return NextResponse.json(
        fail(
          detail ||
            `Product ${productCode} is missing one or more required accounting account mappings (income / COGS / inventory).`,
          "PRODUCT_ACCOUNTS_MISSING"
        ),
        { status: 422 }
      );
    }
    console.error("[INV APPROVE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
