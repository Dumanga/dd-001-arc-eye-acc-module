// GET /api/accounting/material-issues/[id]
//
// Returns a single material-issue detail payload for the preview screen.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export type MaterialIssueDetailLine = {
  id: string;
  lineOrder: number;
  productId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: string;
  unitCost: string;
  lineValue: string;
  uomName: string;
  uomBase: string;
  notes: string;
};

export type MaterialIssueDetail = {
  id: string;
  issueNumber: string;
  issueDate: string;
  status: string;
  statusLabel: string;
  currency: string;
  requestedBy: string;
  purpose: string;
  notes: string;
  total: string;
  createdAt: string;
  approvedAt: string | null;
  createdByName: string;
  approvedByName: string | null;
  store: { id: string; code: string; name: string };
  expenseAccount: { id: string; code: string; name: string; categoryCode: string };
  lines: MaterialIssueDetailLine[];
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "accounts"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const issue = await prisma.accountingMaterialIssue.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, code: true, name: true } },
        expenseAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            type: { select: { category: { select: { code: true } } } },
          },
        },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: { orderBy: { lineOrder: "asc" } },
      },
    });

    if (!issue) {
      return NextResponse.json(
        fail("Material issue not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    const detail: MaterialIssueDetail = {
      id: issue.id,
      issueNumber: issue.issueNumber,
      issueDate: formatDate(issue.issueDate),
      status: issue.status,
      statusLabel: STATUS_LABELS[issue.status] ?? issue.status,
      currency: issue.currency,
      requestedBy: issue.requestedBy,
      purpose: issue.purpose,
      notes: issue.notes,
      total: Number(issue.total).toFixed(2),
      createdAt: issue.createdAt.toISOString(),
      approvedAt: issue.approvedAt?.toISOString() ?? null,
      createdByName: issue.createdBy.displayName,
      approvedByName: issue.approvedBy?.displayName ?? null,
      store: issue.store,
      expenseAccount: {
        id: issue.expenseAccount.id,
        code: issue.expenseAccount.code,
        name: issue.expenseAccount.name,
        categoryCode: issue.expenseAccount.type.category.code,
      },
      lines: issue.lines.map((l) => ({
        id: l.id,
        lineOrder: l.lineOrder,
        productId: l.productId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description,
        quantity: Number(l.quantity).toString(),
        unitCost: Number(l.unitCost).toFixed(2),
        lineValue: Number(l.lineValue).toFixed(2),
        uomName: l.uomName,
        uomBase: l.uomBase,
        notes: l.notes,
      })),
    };

    return NextResponse.json(
      ok({ issue: detail }, "Material issue detail fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[MATERIAL ISSUE DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
