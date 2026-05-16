// POST /api/accounting/material-issues/[id]/approve
//
// Transitions a DRAFT material issue to APPROVED, posts the GL rows + snapshots
// the WAC per line + decrements branch stock per accounting-theories.md §10.
// Idempotent guard: rejects if already APPROVED or CANCELLED.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postMaterialIssueApproval } from "@/lib/accounting/material-issue-posting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const issue = await prisma.accountingMaterialIssue.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!issue) {
      return NextResponse.json(
        fail("Material issue not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (issue.status === "APPROVED") {
      return NextResponse.json(
        fail("Material issue is already approved.", "ALREADY_APPROVED"),
        { status: 409 }
      );
    }
    if (issue.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled issues cannot be approved.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const statusUpdate = await tx.accountingMaterialIssue.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });
      if (statusUpdate.count !== 1) {
        throw new Error("MATERIAL_ISSUE_STATE_CHANGED");
      }

      const posted = await postMaterialIssueApproval(tx, {
        materialIssueId: id,
        createdById: currentUser.id,
      });

      const updated = await tx.accountingMaterialIssue.findUniqueOrThrow({
        where: { id },
        select: { id: true, issueNumber: true },
      });

      return { updated, posted };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          issueNumber: result.updated.issueNumber,
          glEntriesWritten: result.posted.glEntriesWritten,
          total: result.posted.total.toFixed(2),
        },
        "Material issue approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "MATERIAL_ISSUE_STATE_CHANGED") {
        return NextResponse.json(
          fail("Issue state changed — refresh and try again.", "INVALID_STATE"),
          { status: 409 }
        );
      }
      if (err.message.startsWith("INSUFFICIENT_STOCK:")) {
        return NextResponse.json(
          fail(err.message.slice("INSUFFICIENT_STOCK:".length), "INSUFFICIENT_STOCK"),
          { status: 409 }
        );
      }
      if (err.message.startsWith("MIN_NO_COST_BASIS:")) {
        return NextResponse.json(
          fail(err.message.slice("MIN_NO_COST_BASIS:".length), "MIN_NO_COST_BASIS"),
          { status: 422 }
        );
      }
    }
    console.error("[MATERIAL ISSUE APPROVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
