// GET /api/accounting/reports/journal-entries?dateRange=&accountId=&docType=&storeId=&jeNo=
//
// Groups GL rows by (documentType, documentNumber) — that pair is
// the unique form-id-generated identifier for the originating
// transaction, so each group IS one logical journal entry per the
// global double-entry standard.
//
// Output shape (flat rows + rowStyles so the existing preview shell
// can render the grouping visually without a separate code path):
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │ JE# INV-2026-0001 · 02 May 2026 · 4 lines      (header row) │
//   ├─────────────────────────────────────────────────────────────┤
//   │   AAR001 DEBTOR RECEIVABLE      200,000     —    Invoice…   │
//   │   PRIN0001 PRODUCT INCOME            —   200,000  Invoice…  │
//   │   COGS0001 COST OF GOODS         142,500     —    COGS…     │
//   │   INVE0001 INVENTORY                —   142,500   Inv…      │
//   ├─────────────────────────────────────────────────────────────┤
//   │           JE Subtotal           342,500    342,500           (subtotal)
//   └─────────────────────────────────────────────────────────────┘
//
// New filter: jeNo — direct lookup for a specific JE by document
// number (case-insensitive contains match).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  fmtDateSlt,
  parseDateRange,
  toDebitCredit,
  type ReportPayload,
  type ReportRowStyle,
} from "@/lib/accounting/reports-shared";

const ALLOWED_DOC_TYPES = new Set([
  "GRN",
  "GRR",
  "PV",
  "INV",
  "SR",
  "RC",
  "POS",
  "JE",
  "IBT",
  "EXP",
  "JEV",
  "MIN",
]);

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const accountId = url.searchParams.get("accountId")?.trim() ?? "";
    const docTypeRaw = url.searchParams.get("docType")?.trim().toUpperCase() ?? "";
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const jeNo = url.searchParams.get("jeNo")?.trim() ?? "";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    // When jeNo / accountId is provided we still want to return the
    // FULL group(s) — i.e. if the user filters by accountId we look up
    // the matching documentNumbers first, then pull ALL rows for those
    // documents so the journal entry stays balanced in the preview.
    let docNumbersFromAccountFilter: string[] | null = null;
    if (accountId) {
      const hits = await prisma.accountingJournalEntry.findMany({
        where: {
          accountId,
          ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
          ...(ALLOWED_DOC_TYPES.has(docTypeRaw)
            ? { documentType: docTypeRaw as Prisma.AccountingJournalEntryWhereInput["documentType"] }
            : {}),
          ...(from || to
            ? {
                documentDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        select: { documentNumber: true },
        distinct: ["documentNumber"],
      });
      docNumbersFromAccountFilter = hits.map((h) => h.documentNumber);
      if (docNumbersFromAccountFilter.length === 0) {
        return NextResponse.json(
          ok(
            {
              columns: ["JE No", "Account", "Memo", "Debit", "Credit"],
              align: ["left", "left", "left", "right", "right"],
              rows: [],
              rowStyles: [],
              totals: [
                { label: "Journal Entries", value: "0" },
                { label: "Total Debit", value: fmtMoneyAlways(0) },
                { label: "Total Credit", value: fmtMoneyAlways(0), bold: true },
              ],
            } satisfies ReportPayload,
            "Journal entries report generated.",
          ),
          { status: 200 },
        );
      }
    }

    const where: Prisma.AccountingJournalEntryWhereInput = {
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(docNumbersFromAccountFilter
        ? { documentNumber: { in: docNumbersFromAccountFilter } }
        : ALLOWED_DOC_TYPES.has(docTypeRaw)
          ? { documentType: docTypeRaw as Prisma.AccountingJournalEntryWhereInput["documentType"] }
          : {}),
      ...(jeNo ? { documentNumber: { contains: jeNo } } : {}),
      ...(!docNumbersFromAccountFilter && (from || to)
        ? {
            documentDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const entries = await prisma.accountingJournalEntry.findMany({
      where,
      orderBy: [
        { documentDate: "asc" },
        { documentNumber: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        documentDate: true,
        documentType: true,
        documentNumber: true,
        accountCode: true,
        accountName: true,
        value: true,
        narration: true,
        account: {
          select: {
            category: { select: { code: true } },
          },
        },
      },
    });

    // Group by (documentType, documentNumber). The pair is the unique
    // form-id-generated identifier per transaction.
    type GroupKey = string;
    type LineRow = {
      accountLabel: string;
      debit: number;
      credit: number;
      narration: string;
    };
    type Group = {
      key: GroupKey;
      docType: string;
      docNumber: string;
      date: Date;
      lines: LineRow[];
      subDr: number;
      subCr: number;
    };
    const groups = new Map<GroupKey, Group>();
    for (const e of entries) {
      const key = `${e.documentType}|${e.documentNumber}`;
      const v = Number(e.value);
      const { debit, credit } = toDebitCredit(v, e.account.category.code);
      const existing =
        groups.get(key) ??
        ({
          key,
          docType: e.documentType,
          docNumber: e.documentNumber,
          date: e.documentDate,
          lines: [],
          subDr: 0,
          subCr: 0,
        } satisfies Group);
      existing.lines.push({
        accountLabel: `${e.accountCode} ${e.accountName}`,
        debit,
        credit,
        narration: e.narration || "",
      });
      existing.subDr += debit;
      existing.subCr += credit;
      groups.set(key, existing);
    }

    // Build flat rows + parallel rowStyles array. For each group:
    //   - 1 header row: "JE# INV-2026-0001 · 02 May 2026 · 4 lines"
    //   - N line rows: account / debit / credit / memo
    //   - 1 subtotal row: blank + blank + "JE Subtotal" + sum dr + sum cr
    const rows: string[][] = [];
    const rowStyles: ReportRowStyle[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    let jeCount = 0;

    const orderedGroups = Array.from(groups.values()).sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      if (d !== 0) return d;
      return a.docNumber.localeCompare(b.docNumber);
    });

    for (const g of orderedGroups) {
      jeCount += 1;
      totalDebit += g.subDr;
      totalCredit += g.subCr;
      const balanced = Math.abs(g.subDr - g.subCr) < 0.005;

      // Header row spans the JE no + date + line count.
      rows.push([
        `JE# ${g.docNumber}`,
        fmtDateSlt(g.date),
        `${g.docType} · ${g.lines.length} line${g.lines.length === 1 ? "" : "s"}${balanced ? "" : "  ⚠ NOT BALANCED"}`,
        "",
        "",
      ]);
      rowStyles.push("header");

      for (const l of g.lines) {
        rows.push([
          "",
          l.accountLabel,
          l.narration || "—",
          l.debit > 0 ? fmtMoneyAlways(l.debit) : "—",
          l.credit > 0 ? fmtMoneyAlways(l.credit) : "—",
        ]);
        rowStyles.push("normal");
      }

      rows.push([
        "",
        "",
        "JE Subtotal",
        fmtMoneyAlways(g.subDr),
        fmtMoneyAlways(g.subCr),
      ]);
      rowStyles.push("subtotal");
    }

    const totals = [
      { label: "Journal Entries", value: String(jeCount) },
      { label: "Total Debit", value: fmtMoneyAlways(totalDebit) },
      { label: "Total Credit", value: fmtMoneyAlways(totalCredit), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["JE No", "Account", "Memo", "Debit", "Credit"],
      align: ["left", "left", "left", "right", "right"],
      rows,
      rowStyles,
      totals,
    };

    return NextResponse.json(ok(payload, "Journal entries report generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT JOURNAL-ENTRIES]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
