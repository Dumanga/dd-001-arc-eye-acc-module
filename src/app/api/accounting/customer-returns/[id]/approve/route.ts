import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postCustomerReturnApproval } from "@/lib/accounting/customer-return-posting";
import { incrementProductStock } from "@/lib/accounting/product-stock";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const ret = await prisma.accountingCustomerReturn.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!ret) {
      return NextResponse.json(fail("Customer return not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (ret.status === "APPROVED") {
      return NextResponse.json(
        fail("Customer return is already approved.", "ALREADY_APPROVED"),
        { status: 409 },
      );
    }
    if (ret.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled returns cannot be approved.", "INVALID_STATE"),
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Re-validate caps inside the transaction. Another return or CPR may
      // have been approved while this one was a draft.
      const draft = await tx.accountingCustomerReturn.findUniqueOrThrow({
        where: { id },
        include: {
          invoice: {
            include: {
              paymentAllocations: {
                where: { receipt: { status: "APPROVED" } },
                select: { receivableAmount: true },
              },
              customerReturns: {
                where: { status: "APPROVED", id: { not: id } },
                select: {
                  totalNet: true,
                  lines: { select: { invoiceLineId: true, returnQty: true } },
                },
              },
              lines: { select: { id: true, quantity: true } },
            },
          },
          sourcePosBill: {
            include: {
              customerReturns: {
                where: { status: "APPROVED", id: { not: id } },
                select: {
                  totalNet: true,
                  lines: { select: { sourcePosBillLineId: true, returnQty: true } },
                },
              },
              lines: { select: { id: true, quantity: true } },
            },
          },
          lines: {
            select: {
              id: true,
              invoiceLineId: true,
              sourcePosBillLineId: true,
              returnQty: true,
              productId: true,
              product: { select: { itemType: true } },
            },
          },
        },
      });

      // Branch on sourceType — INVOICE path stays as-is, POS_BILL path
      // mirrors it against the POS bill row.
      if (draft.sourceType === "INVOICE") {
        if (!draft.invoice) throw new Error("CR_APPROVAL_UNSUPPORTED_SOURCE");
        const draftInvoice = draft.invoice;

        // Per-line cap re-check
        const returnedByLineId = new Map<string, number>();
        for (const cr of draftInvoice.customerReturns) {
          for (const line of cr.lines) {
            if (!line.invoiceLineId) continue;
            returnedByLineId.set(
              line.invoiceLineId,
              (returnedByLineId.get(line.invoiceLineId) ?? 0) + Number(line.returnQty),
            );
          }
        }
        const invoiceLineQty = new Map(
          draftInvoice.lines.map((l) => [l.id, Number(l.quantity)]),
        );
        for (const line of draft.lines) {
          if (!line.invoiceLineId) continue;
          const original = invoiceLineQty.get(line.invoiceLineId) ?? 0;
          const alreadyReturned = returnedByLineId.get(line.invoiceLineId) ?? 0;
          const remaining = Math.max(0, original - alreadyReturned);
          if (Number(line.returnQty) > remaining + 1e-9) {
            throw new Error("CR_APPROVAL_LINE_EXCEEDS_REMAINING");
          }
        }

        // Header value cap re-check
        const invoiceTotal = Number(draftInvoice.total);
        const paidAmount = draftInvoice.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        const alreadyReturnedNet = draftInvoice.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remainingReturnable = Math.max(
          0,
          invoiceTotal - paidAmount - alreadyReturnedNet,
        );
        if (Number(draft.totalNet) > remainingReturnable + 1e-9) {
          throw new Error("CR_APPROVAL_VALUE_EXCEEDS_REMAINING");
        }
      } else if (draft.sourceType === "POS_BILL") {
        if (!draft.sourcePosBill) throw new Error("CR_APPROVAL_UNSUPPORTED_SOURCE");
        const posBill = draft.sourcePosBill;

        const returnedByLineId = new Map<string, number>();
        for (const cr of posBill.customerReturns) {
          for (const line of cr.lines) {
            if (!line.sourcePosBillLineId) continue;
            returnedByLineId.set(
              line.sourcePosBillLineId,
              (returnedByLineId.get(line.sourcePosBillLineId) ?? 0) +
                Number(line.returnQty),
            );
          }
        }
        const billLineQty = new Map(posBill.lines.map((l) => [l.id, Number(l.quantity)]));
        for (const line of draft.lines) {
          if (!line.sourcePosBillLineId) continue;
          const original = billLineQty.get(line.sourcePosBillLineId) ?? 0;
          const alreadyReturned = returnedByLineId.get(line.sourcePosBillLineId) ?? 0;
          const remaining = Math.max(0, original - alreadyReturned);
          if (Number(line.returnQty) > remaining + 1e-9) {
            throw new Error("CR_APPROVAL_LINE_EXCEEDS_REMAINING");
          }
        }

        // SPLIT bills haven't been settled yet (no merchant-CPR-against-
        // POS-bill yet implemented), so paid = 0; cap = total − approved
        // CR net.
        const billTotal = Number(posBill.total);
        const alreadyReturnedNet = posBill.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remainingReturnable = Math.max(0, billTotal - alreadyReturnedNet);
        if (Number(draft.totalNet) > remainingReturnable + 1e-9) {
          throw new Error("CR_APPROVAL_VALUE_EXCEEDS_REMAINING");
        }
      } else {
        throw new Error("CR_APPROVAL_UNSUPPORTED_SOURCE");
      }

      const approvedAt = new Date();
      const update = await tx.accountingCustomerReturn.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });
      if (update.count !== 1) {
        throw new Error("CR_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingCustomerReturn.findUniqueOrThrow({
        where: { id },
        select: { id: true, returnNumber: true, storeId: true },
      });

      // Post double-entry + customer-ledger transactions per
      // accounting-theories.md (sections 6.1 + 6.2).
      await postCustomerReturnApproval(tx, {
        customerReturnId: id,
        createdById: currentUser.id,
      });

      // Stock comes back into branch + global counter for inventory items.
      for (const line of draft.lines) {
        if (line.product.itemType !== "INVENTORY_ITEM") continue;
        const qty = Number(line.returnQty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        await incrementProductStock(tx, {
          productId: line.productId,
          storeId: updated.storeId,
          qty,
        });
      }

      return { updated };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          returnNumber: result.updated.returnNumber,
        },
        "Customer return approved.",
      ),
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "CR_APPROVAL_STATE_CHANGED") {
        return NextResponse.json(
          fail(
            "Return approval state changed. Refresh and try again.",
            "INVALID_STATE",
          ),
          { status: 409 },
        );
      }
      if (err.message === "CR_APPROVAL_LINE_EXCEEDS_REMAINING") {
        return NextResponse.json(
          fail(
            "One or more return lines exceed the remaining returnable qty on the source invoice line. Reduce the quantity and try again.",
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
      if (err.message === "CR_APPROVAL_VALUE_EXCEEDS_REMAINING") {
        return NextResponse.json(
          fail(
            "Return value exceeds the invoice's remaining returnable amount (paid portion is closed). Reduce the return and try again.",
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
    }

    console.error("[CR APPROVE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
