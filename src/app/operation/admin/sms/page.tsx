"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";

type RepairRow = {
  id: string;
  billNo: string;
  intakeType: "WALK_IN" | "COURIER";
  estimatedDeliveryDate: string;
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  client: { name: string };
  brand: { name: string };
};

type RepairApiPayload = {
  success: boolean;
  message: string;
  data?: {
    items: RepairRow[];
    total: number;
    page: number;
    pageSize: number;
  };
};

type ReminderStatusPayload = {
  success: boolean;
  message: string;
  data?: {
    sentRepairIds: string[];
  } | null;
};

type ReminderSendPayload = {
  success: boolean;
  message: string;
  data?: {
    repairId: string;
    alreadySent: boolean;
  } | null;
};

type FilterKey = "ALL" | "WALK_IN" | "COURIER";

const filterChips: Array<{ key: FilterKey; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "WALK_IN", label: "Walk-in" },
  { key: "COURIER", label: "Courier" },
];

const statusMeta: Record<
  RepairRow["status"],
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  },
  PROCESSING: {
    label: "Processing",
    className: "bg-sky-400/15 text-sky-300 border-sky-400/30",
  },
  REPAIR_COMPLETED: {
    label: "Repair Completed",
    className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-zinc-400/15 text-zinc-300 border-zinc-400/30",
  },
};

function toDateOnlyKey(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDeliveryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function SmsPortalPage() {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [pendingReminder, setPendingReminder] = useState<RepairRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayLabel = useMemo(() => formatDateLabel(today), [today]);
  const targetDate = useMemo(() => {
    const next = new Date(today);
    next.setDate(next.getDate() + 2);
    return next;
  }, [today]);
  const targetDateKey = useMemo(() => toDateOnlyKey(targetDate), [targetDate]);
  const targetDateLabel = useMemo(() => formatDateLabel(targetDate), [targetDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setLoadError(null);
      setReminderError(null);

      try {
        const firstResponse = await fetch(
          "/api/repairs?page=1&pageSize=50&excludeDelivered=1"
        );
        const firstPayload = (await firstResponse.json()) as RepairApiPayload;

        if (!firstResponse.ok || !firstPayload.success || !firstPayload.data) {
          throw new Error(firstPayload.message || "Failed to load repairs.");
        }

        const pageSize = firstPayload.data.pageSize;
        const total = firstPayload.data.total;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        let allItems = [...firstPayload.data.items];

        if (totalPages > 1) {
          const requests: Promise<Response>[] = [];
          for (let page = 2; page <= totalPages; page += 1) {
            requests.push(
              fetch(`/api/repairs?page=${page}&pageSize=50&excludeDelivered=1`)
            );
          }

          const responses = await Promise.all(requests);
          const payloads = await Promise.all(
            responses.map(async (res) => (await res.json()) as RepairApiPayload)
          );

          payloads.forEach((payload, index) => {
            if (!responses[index].ok || !payload.success || !payload.data) {
              throw new Error(payload.message || "Failed to load repairs.");
            }
            allItems = allItems.concat(payload.data.items);
          });
        }

        const dueRows = allItems.filter((item) => {
          const dateKey = toDateOnlyKey(new Date(item.estimatedDeliveryDate));
          return dateKey === targetDateKey;
        });

        const statusResponse = await fetch(
          `/api/sms/reminders?targetDate=${encodeURIComponent(targetDateKey)}`
        );
        const statusPayload = (await statusResponse.json()) as ReminderStatusPayload;
        const sentRepairIds =
          statusResponse.ok && statusPayload.success && statusPayload.data
            ? statusPayload.data.sentRepairIds
            : [];

        if (!cancelled) {
          setRows(dueRows);
          const validIds = new Set(dueRows.map((row) => row.id));
          setSentIds(
            new Set(sentRepairIds.filter((id) => validIds.has(id)))
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load reminders."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRows();
    return () => {
      cancelled = true;
    };
  }, [targetDateKey]);

  const filteredRows = useMemo(() => {
    if (filter === "ALL") {
      return rows;
    }
    return rows.filter((row) => row.intakeType === filter);
  }, [filter, rows]);

  function openReminderConfirm(row: RepairRow) {
    setPendingReminder(row);
    setConfirmOpen(true);
  }

  function closeReminderConfirm() {
    if (sendingReminder) {
      return;
    }
    setConfirmOpen(false);
    setPendingReminder(null);
  }

  async function markReminderSent() {
    if (!pendingReminder) {
      return;
    }
    setSendingReminder(true);
    setReminderError(null);
    try {
      const response = await fetch("/api/sms/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repairId: pendingReminder.id }),
      });
      const payload = (await response.json()) as ReminderSendPayload;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to send reminder.");
      }
      setSentIds((prev) => {
        const next = new Set(prev);
        next.add(pendingReminder.id);
        return next;
      });
      setConfirmOpen(false);
      setPendingReminder(null);
    } catch (error) {
      setReminderError(
        error instanceof Error ? error.message : "Unable to send reminder."
      );
      setConfirmOpen(false);
      setPendingReminder(null);
    } finally {
      setSendingReminder(false);
    }
  }

  return (
    <div className="grid content-start gap-4 self-start">
      <div className="h-fit rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              SMS Portal
            </p>
            <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
              Delivery Reminder Queue
            </h2>
          </div>
          <div className="rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-2 text-xs text-[var(--text-muted)]">
            Today: <span className="font-semibold text-[var(--foreground)]">{todayLabel}</span>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Send reminder SMS to customers whose bats are due on{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {targetDateLabel}
          </span>{" "}
          so pickups are confirmed in advance.
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-4 sm:p-6">
        {reminderError ? (
          <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {reminderError}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => {
            const isActive = chip.key === filter;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={`h-8 rounded-full px-4 text-xs transition sm:h-9 ${
                  isActive
                    ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                    : "border border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)] hover:bg-[var(--panel)]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Loading scheduled reminders...
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-6 text-sm text-rose-300">
              {loadError}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No repairs are currently scheduled for delivery in two days.
            </div>
          ) : (
            filteredRows.map((row) => {
              const sent = sentIds.has(row.id);
              const meta = statusMeta[row.status];
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{row.billNo}</p>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm">
                    <p className="text-[var(--foreground)]">{row.client.name}</p>
                    <p className="text-[var(--text-muted)]">{row.brand.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Delivery: {formatDeliveryDate(row.estimatedDeliveryDate)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sent}
                    onClick={() => openReminderConfirm(row)}
                    className={`mt-4 h-9 w-full rounded-full px-4 text-xs font-semibold transition ${
                      sent
                        ? "cursor-not-allowed border border-[var(--stroke)] bg-[var(--panel)] text-[var(--text-muted)]"
                        : "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                    }`}
                  >
                    {sent ? "Reminder Sent" : "Send Reminder"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[var(--stroke)] md:block">
          <table className="w-full min-w-[860px]">
            <thead className="bg-[var(--panel-muted)] text-left text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Bill No</th>
                <th className="px-4 py-3 font-medium">Client Name</th>
                <th className="px-4 py-3 font-medium">Bat Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Estimated Delivery</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-6 text-sm text-[var(--text-muted)]"
                    colSpan={6}
                  >
                    Loading scheduled reminders...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-rose-300" colSpan={6}>
                    {loadError}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-sm text-[var(--text-muted)]"
                    colSpan={6}
                  >
                    No repairs are currently scheduled for delivery in two days.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const sent = sentIds.has(row.id);
                  const meta = statusMeta[row.status];
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--stroke)] text-sm"
                    >
                      <td className="px-4 py-3 font-semibold">{row.billNo}</td>
                      <td className="px-4 py-3">{row.client.name}</td>
                      <td className="px-4 py-3">{row.brand.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatDeliveryDate(row.estimatedDeliveryDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={sent}
                          onClick={() => openReminderConfirm(row)}
                          className={`h-9 rounded-full px-4 text-xs font-semibold transition ${
                            sent
                              ? "cursor-not-allowed border border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)]"
                              : "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                          }`}
                        >
                          {sent ? "Reminder Sent" : "Send Reminder"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Send Delivery Reminder?"
        description={
          pendingReminder
            ? `Send reminder SMS for ${pendingReminder.billNo} (${pendingReminder.client.name}) scheduled on ${formatDeliveryDate(
                pendingReminder.estimatedDeliveryDate
              )}.`
            : "Confirm reminder send."
        }
        confirmLabel="Send Reminder"
        loading={sendingReminder}
        onCancel={closeReminderConfirm}
        onConfirm={() => {
          void markReminderSent();
        }}
      />
    </div>
  );
}
