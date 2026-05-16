"use client";

// Super-admin "Pending Forms" inbox. Opened from the dashboard
// button next to "Open POS". Shows every DRAFT document grouped by
// section (supplier / customer / internal) with checkboxes for bulk
// approval and a "View" button that opens the doc's own screen.
//
// Bulk approve fires one POST per selected row sequentially so we
// can show per-row success / failure feedback. Purchase Orders are
// view-only here (they don't have an approval gate in the schema).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import type {
  PendingFormGroup,
  PendingFormRow,
  PendingFormsPayload,
} from "@/app/api/accounting/dashboard/pending-forms/route";

type PendingFormsModalProps = {
  open: boolean;
  onClose: () => void;
};

// Per-row state during the bulk-approve run.
type ApproveState = "idle" | "running" | "success" | "error";
type RowState = { state: ApproveState; message?: string };

export function PendingFormsModal({ open, onClose }: PendingFormsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PendingFormsPayload | null>(null);
  // Set of row ids that the user has ticked.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Map of rowId → its approval state, populated during bulk-approve.
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-fetch every time the modal opens so the list reflects the
  // latest server state (new drafts created since last open).
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setRowStates(new Map());
    setConfirming(false);
    setRunning(false);
    setError(null);
    setLoading(true);
    fetch("/api/accounting/dashboard/pending-forms")
      .then(async (res) => {
        const j = (await res.json()) as {
          success: boolean;
          data: PendingFormsPayload | null;
          message?: string;
        };
        if (!res.ok || !j.success || !j.data) {
          setError(j.message || "Could not load pending forms.");
          return;
        }
        setPayload(j.data);
      })
      .catch(() => setError("Network error — could not reach the server."))
      .finally(() => setLoading(false));
  }, [open]);

  if (!mounted || !open) return null;

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(rows: PendingFormRow[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const approvableIds = rows
        .filter((r) => r.approveEndpoint !== null)
        .map((r) => r.id);
      const allSelected = approvableIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of approvableIds) next.delete(id);
      } else {
        for (const id of approvableIds) next.add(id);
      }
      return next;
    });
  }

  async function runBulkApprove() {
    if (!payload || selectedIds.size === 0) return;
    setConfirming(false);
    setRunning(true);

    // Build a flat lookup of every row from every group so we can
    // resolve approveEndpoint by id in iteration order.
    const allRows = [
      ...payload.supplier.flatMap((g) => g.rows),
      ...payload.customer.flatMap((g) => g.rows),
      ...payload.internal.flatMap((g) => g.rows),
    ];
    const idToRow = new Map(allRows.map((r) => [r.id, r]));
    const toApprove = Array.from(selectedIds)
      .map((id) => idToRow.get(id))
      .filter((r): r is PendingFormRow => Boolean(r) && r!.approveEndpoint !== null);

    // Initialise each row's state to "running".
    setRowStates(
      new Map(toApprove.map((r) => [r.id, { state: "running" as const }])),
    );

    // Sequential, not parallel — keeps the UI updates ordered and
    // avoids stampeding 10+ approval flows concurrently against the
    // posting helpers.
    for (const row of toApprove) {
      try {
        const res = await fetch(row.approveEndpoint!, {
          method: "POST",
          headers: { "x-portal": "ACCOUNTING" },
        });
        const j = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
        };
        if (res.ok && j.success !== false) {
          setRowStates((prev) => {
            const n = new Map(prev);
            n.set(row.id, { state: "success" });
            return n;
          });
        } else {
          setRowStates((prev) => {
            const n = new Map(prev);
            n.set(row.id, {
              state: "error",
              message: j.message || `HTTP ${res.status}`,
            });
            return n;
          });
        }
      } catch (e) {
        setRowStates((prev) => {
          const n = new Map(prev);
          n.set(row.id, {
            state: "error",
            message: e instanceof Error ? e.message : "Network error",
          });
          return n;
        });
      }
    }

    setRunning(false);
    // Refresh the list so successful approvals disappear and any
    // failures stay visible for the next attempt.
    setLoading(true);
    fetch("/api/accounting/dashboard/pending-forms")
      .then(async (res) => {
        const j = (await res.json()) as {
          success: boolean;
          data: PendingFormsPayload | null;
        };
        if (j.success && j.data) setPayload(j.data);
      })
      .finally(() => {
        setLoading(false);
        setSelectedIds(new Set());
      });
  }

  const totalCount = payload?.totalCount ?? 0;
  const selectedCount = selectedIds.size;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgba(33,27,23,0.55)] px-4 py-6">
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col rounded-[26px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] shadow-[0_28px_70px_rgba(44,42,44,0.22)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#eadfd5] p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
              Super admin inbox
            </p>
            <h3 className="mt-1 font-sans text-xl font-semibold text-[#1f1d1c]">
              Pending forms
            </h3>
            <p className="mt-1 text-sm text-[#7c6f65]">
              {loading
                ? "Loading…"
                : `${totalCount} draft document${totalCount === 1 ? "" : "s"} awaiting your action.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-full p-1 text-[#9b8f87] transition hover:bg-[#fff7f0] hover:text-[#1f1d1c] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#7c6f65]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pending forms…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {error}
            </div>
          ) : payload ? (
            <div className="grid gap-6">
              <Section title="Supplier" groups={payload.supplier} {...{ selectedIds, rowStates, toggleRow, toggleAll }} />
              <Section title="Customer" groups={payload.customer} {...{ selectedIds, rowStates, toggleRow, toggleAll }} />
              <Section title="Internal" groups={payload.internal} {...{ selectedIds, rowStates, toggleRow, toggleAll }} />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eadfd5] p-4">
          <p className="text-sm text-[#7c6f65]">
            {selectedCount > 0
              ? `${selectedCount} selected for approval`
              : "Tick rows to bulk-approve, or click View to open a single document."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs font-semibold text-[#6f6761] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={running || selectedCount === 0}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)] transition hover:bg-[#ff8a2c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Approving…
                </>
              ) : (
                `Approve ${selectedCount > 0 ? selectedCount : ""} Selected`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation popup */}
      {confirming ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(33,27,23,0.65)] px-4 py-6">
          <div className="w-full max-w-sm rounded-[22px] border border-[#ddd8d1] bg-white p-6 shadow-[0_28px_70px_rgba(44,42,44,0.28)]">
            <h4 className="font-sans text-base font-semibold text-[#1f1d1c]">
              Approve {selectedCount} document{selectedCount === 1 ? "" : "s"}?
            </h4>
            <p className="mt-2 text-sm text-[#7c6f65]">
              Each document will be approved individually. Any that fail will
              stay in the list with an error so you can investigate.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs font-semibold text-[#6f6761] transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runBulkApprove()}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white transition hover:bg-[#ff8a2c]"
              >
                Yes, approve all
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function Section({
  title,
  groups,
  selectedIds,
  rowStates,
  toggleRow,
  toggleAll,
}: {
  title: string;
  groups: PendingFormGroup[];
  selectedIds: Set<string>;
  rowStates: Map<string, RowState>;
  toggleRow: (id: string) => void;
  toggleAll: (rows: PendingFormRow[]) => void;
}) {
  const visibleGroups = groups.filter((g) => g.count > 0);
  if (visibleGroups.length === 0) {
    return (
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
          {title}
        </h4>
        <p className="rounded-2xl border border-dashed border-[#eadfd5] bg-[#fcfaf7] px-4 py-3 text-sm text-[#9b8f87]">
          No drafts in this section.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
        {title}
      </h4>
      <div className="grid gap-3">
        {visibleGroups.map((group) => (
          <GroupCard
            key={group.key}
            group={group}
            selectedIds={selectedIds}
            rowStates={rowStates}
            toggleRow={toggleRow}
            toggleAll={toggleAll}
          />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  selectedIds,
  rowStates,
  toggleRow,
  toggleAll,
}: {
  group: PendingFormGroup;
  selectedIds: Set<string>;
  rowStates: Map<string, RowState>;
  toggleRow: (id: string) => void;
  toggleAll: (rows: PendingFormRow[]) => void;
}) {
  const approvableRows = group.rows.filter((r) => r.approveEndpoint !== null);
  const allSelected =
    approvableRows.length > 0 &&
    approvableRows.every((r) => selectedIds.has(r.id));

  return (
    <div className="overflow-hidden rounded-2xl border border-[#eadfd5] bg-white">
      <div className="flex items-center justify-between border-b border-[#f0e5dc] bg-[#fffaf5] px-4 py-2">
        <p className="text-sm font-semibold text-[#1f1d1c]">
          {group.label}{" "}
          <span className="ml-1 text-xs font-medium text-[#9b8f87]">
            · {group.count}
          </span>
        </p>
        {approvableRows.length > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b7f75]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => toggleAll(group.rows)}
              className="h-4 w-4 rounded border-[#dfd4ca] text-[#ff7101] focus:ring-[#ffba82]"
            />
            Select all
          </label>
        ) : null}
      </div>
      <ul>
        {group.rows.map((row) => {
          const state = rowStates.get(row.id);
          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border-b border-[#f5ece2] px-4 py-2.5 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                {row.approveEndpoint ? (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="h-4 w-4 shrink-0 rounded border-[#dfd4ca] text-[#ff7101] focus:ring-[#ffba82]"
                  />
                ) : (
                  <span
                    title="View-only — no approval gate"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#c4b8ae]"
                  >
                    —
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1f1d1c]">
                    {row.number}
                    <span className="ml-2 text-xs font-normal text-[#9b8f87]">
                      {row.date}
                    </span>
                  </p>
                  <p className="truncate text-xs text-[#7c6f65]">
                    {row.partyName}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-[#1f1d1c]">
                  LKR {row.amount}
                </span>
                <StateIndicator state={state} />
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ddd8d1] bg-white px-3 text-xs font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
                >
                  View
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StateIndicator({ state }: { state: RowState | undefined }) {
  if (!state) return null;
  if (state.state === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />;
  }
  if (state.state === "success") {
    return <CheckCircle2 className="h-4 w-4 text-[#18a66a]" />;
  }
  if (state.state === "error") {
    return (
      <span title={state.message ?? "Approval failed"}>
        <XCircle className="h-4 w-4 text-[#e04343]" />
      </span>
    );
  }
  return null;
}
