"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RepairRow = {
  id: string;
  billNo: string;
  physicalBillNo?: string | null;
  intakeType: "WALK_IN" | "COURIER";
  estimatedDeliveryDate: string;
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  client: { name: string; mobile: string };
  brand: { name: string };
  store?: { name: string } | null;
  items?: Array<{
    id: string;
    price: number;
    repairType?: { code: string; name: string } | null;
  }>;
  description?: string | null;
  totalAmount: number;
  advanceAmount: number;
};

type RepairApiPayload = {
  success: boolean;
  message: string;
  data?: {
    items: RepairRow[];
    total: number;
    page: number;
    pageSize: number;
  } | null;
};

type CalendarApiPayload = {
  success: boolean;
  message: string;
  data?: {
    month: string;
    counts: Record<string, number>;
  } | null;
};

type SelectionMode = "single" | "range";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
    label: "Ready",
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

function toDateOnlyKeyFromRaw(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return toDateOnlyKey(date);
}

function formatDateLabel(value: string) {
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

function formatMonthKey(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function compareDateKeys(a: string, b: string) {
  return a.localeCompare(b);
}

function money(value: number) {
  return `LKR ${value.toLocaleString()}`;
}

export default function AdminDashboard() {
  const todayKey = useMemo(() => toDateOnlyKey(new Date()), []);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("single");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [rangeStart, setRangeStart] = useState(todayKey);
  const [rangeEnd, setRangeEnd] = useState("");
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);

  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [countsByDate, setCountsByDate] = useState<Record<string, number>>({});
  const [loadedMonths, setLoadedMonths] = useState<Record<string, boolean>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedRepair, setSelectedRepair] = useState<RepairRow | null>(null);

  const monthKey = useMemo(
    () => formatMonthKey(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const selectedLabel = useMemo(() => {
    if (selectionMode === "single") {
      return `Selected: ${formatDateLabel(selectedDate)}`;
    }
    if (rangeStart && rangeEnd) {
      return `Selected: ${formatDateLabel(rangeStart)} to ${formatDateLabel(rangeEnd)}`;
    }
    if (rangeStart) {
      return `Selected start: ${formatDateLabel(rangeStart)}`;
    }
    return "Select a date range";
  }, [selectionMode, selectedDate, rangeStart, rangeEnd]);

  const loadRepairs = useCallback(async () => {
    setLoadingRows(true);
    setRowsError(null);
    try {
      const firstResponse = await fetch(
        "/api/repairs?page=1&pageSize=50&excludeDelivered=1"
      );
      const firstPayload = (await firstResponse.json()) as RepairApiPayload;
      if (!firstResponse.ok || !firstPayload.success || !firstPayload.data) {
        throw new Error(firstPayload.message || "Failed to load repairs.");
      }

      let allItems = [...firstPayload.data.items];
      const pageSize = firstPayload.data.pageSize;
      const total = firstPayload.data.total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      if (totalPages > 1) {
        const requests: Promise<Response>[] = [];
        for (let page = 2; page <= totalPages; page += 1) {
          requests.push(fetch(`/api/repairs?page=${page}&pageSize=50&excludeDelivered=1`));
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

      setRows(allItems);
    } catch (error) {
      setRowsError(error instanceof Error ? error.message : "Unable to load deliveries.");
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  const loadCalendarMonth = useCallback(
    async (year: number, month: number) => {
      const key = formatMonthKey(year, month);
      if (loadedMonths[key]) {
        return;
      }
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const response = await fetch(`/api/repairs/calendar?month=${key}`);
        const payload = (await response.json()) as CalendarApiPayload;
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Failed to load calendar.");
        }
        setCountsByDate((prev) => ({ ...prev, ...payload.data!.counts }));
        setLoadedMonths((prev) => ({ ...prev, [key]: true }));
      } catch (error) {
        setCalendarError(
          error instanceof Error ? error.message : "Unable to load calendar counts."
        );
      } finally {
        setCalendarLoading(false);
      }
    },
    [loadedMonths]
  );

  useEffect(() => {
    loadRepairs();
  }, [loadRepairs]);

  useEffect(() => {
    loadCalendarMonth(viewYear, viewMonth);
  }, [loadCalendarMonth, viewYear, viewMonth]);

  useEffect(() => {
    if (!selectedRepair) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedRepair]);

  const kpis = useMemo(() => {
    const active = rows.length;
    const pending = rows.filter((row) => row.status === "PENDING").length;
    const ready = rows.filter((row) => row.status === "REPAIR_COMPLETED").length;
    const dueToday = rows.filter(
      (row) => toDateOnlyKeyFromRaw(row.estimatedDeliveryDate) === todayKey
    ).length;
    return [
      { label: "Active Repairs", value: String(active), trend: "Not delivered yet" },
      { label: "Pending Intake", value: String(pending), trend: "Waiting to start" },
      { label: "Ready for Delivery", value: String(ready), trend: "Repair completed" },
      { label: "Due Today", value: String(dueToday), trend: "Scheduled for pickup" },
    ];
  }, [rows, todayKey]);

  const selectedRows = useMemo(() => {
    if (selectionMode === "single") {
      return rows.filter(
        (row) => toDateOnlyKeyFromRaw(row.estimatedDeliveryDate) === selectedDate
      );
    }
    if (!rangeStart) {
      return rows;
    }
    if (!rangeEnd) {
      return rows.filter(
        (row) => toDateOnlyKeyFromRaw(row.estimatedDeliveryDate) === rangeStart
      );
    }
    const [start, end] =
      compareDateKeys(rangeStart, rangeEnd) <= 0
        ? [rangeStart, rangeEnd]
        : [rangeEnd, rangeStart];
    return rows.filter((row) => {
      const key = toDateOnlyKeyFromRaw(row.estimatedDeliveryDate);
      return compareDateKeys(key, start) >= 0 && compareDateKeys(key, end) <= 0;
    });
  }, [rows, selectionMode, selectedDate, rangeStart, rangeEnd]);

  const calendarDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const totalDays = new Date(viewYear, viewMonth, 0).getDate();
    const startOffset = first.getDay();
    const days = Array.from({ length: totalDays }, (_, index) => index + 1);
    return { startOffset, days };
  }, [viewYear, viewMonth]);

  function handleDaySelect(day: number) {
    const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;

    if (selectionMode === "single") {
      setSelectedDate(key);
      return;
    }

    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(key);
      setRangeEnd("");
      return;
    }

    if (compareDateKeys(key, rangeStart) < 0) {
      setRangeStart(key);
      return;
    }

    setRangeEnd(key);
  }

  function isDaySelected(day: number) {
    const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;
    if (selectionMode === "single") {
      return key === selectedDate;
    }
    if (rangeStart && !rangeEnd) {
      return key === rangeStart;
    }
    if (rangeStart && rangeEnd) {
      const [start, end] =
        compareDateKeys(rangeStart, rangeEnd) <= 0
          ? [rangeStart, rangeEnd]
          : [rangeEnd, rangeStart];
      return compareDateKeys(key, start) >= 0 && compareDateKeys(key, end) <= 0;
    }
    return false;
  }

  function prevMonth() {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((prev) => prev - 1);
      return;
    }
    setViewMonth((prev) => prev - 1);
  }

  function nextMonth() {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
      return;
    }
    setViewMonth((prev) => prev + 1);
  }

  function switchMode(mode: SelectionMode) {
    setSelectionMode(mode);
    if (mode === "single") {
      setSelectedDate(rangeStart || selectedDate || todayKey);
      return;
    }
    setRangeStart(selectedDate || todayKey);
    setRangeEnd("");
  }

  function handleViewRepair(row: RepairRow) {
    setSelectedRepair(row);
  }

  function closeRepairModal() {
    setSelectedRepair(null);
  }

  return (
    <div className="grid content-start gap-6 self-start overflow-x-hidden">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {kpi.label}
            </p>
            <p className="mt-3 text-2xl font-semibold">{kpi.value}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{kpi.trend}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="min-w-0 rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Delivery Calendar
              </p>
              <h2 className="mt-2 text-xl font-semibold">Select due window</h2>
            </div>
            <button
              type="button"
              className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
              onClick={loadRepairs}
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={`h-8 rounded-full px-4 text-xs transition ${
                selectionMode === "single"
                  ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)]"
              }`}
              onClick={() => switchMode("single")}
            >
              Single date
            </button>
            <button
              type="button"
              className={`h-8 rounded-full px-4 text-xs transition ${
                selectionMode === "range"
                  ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)]"
              }`}
              onClick={() => switchMode("range")}
            >
              Date range
            </button>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">{selectedLabel}</p>

          <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="h-8 rounded-full border border-[var(--stroke)] px-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                onClick={prevMonth}
              >
                Prev
              </button>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {monthNames[viewMonth - 1]} {viewYear}
              </p>
              <button
                type="button"
                className="h-8 rounded-full border border-[var(--stroke)] px-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                onClick={nextMonth}
              >
                Next
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: calendarDays.startOffset }).map((_, index) => (
                <div key={`space-${index}`} />
              ))}
              {calendarDays.days.map((day) => {
                const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(
                  day
                ).padStart(2, "0")}`;
                const selected = isDaySelected(day);
                const count = countsByDate[key] ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`relative h-10 rounded-xl border text-sm transition ${
                      selected
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                        : "border-[var(--stroke)] bg-[var(--panel)] text-[var(--foreground)] hover:border-emerald-400/40"
                    }`}
                    onClick={() => handleDaySelect(day)}
                  >
                    {day}
                    {count > 0 ? (
                      <span className="absolute right-1 top-1 rounded-full bg-emerald-400 px-1.5 text-[9px] font-semibold text-black">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
            Badge counts show pending deliveries on each date.
          </p>
          {calendarLoading ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Loading calendar counts...</p>
          ) : null}
          {calendarError ? (
            <p className="mt-2 text-xs text-rose-300">{calendarError}</p>
          ) : null}
        </div>

        <div className="min-w-0 rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 xl:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Pending Repairs To Deliver
              </p>
              <h2 className="mt-2 text-xl font-semibold">Delivery queue by selection</h2>
            </div>
            <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-1 text-xs text-[var(--text-muted)]">
              {selectedRows.length} repairs
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:hidden">
            {loadingRows ? (
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                Loading pending deliveries...
              </div>
            ) : rowsError ? (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-6 text-sm text-rose-300">
                {rowsError}
              </div>
            ) : selectedRows.length === 0 ? (
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                No pending deliveries found for the selected date window.
              </div>
            ) : (
              selectedRows.map((row) => {
                const meta = statusMeta[row.status];
                return (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{row.billNo}</p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{row.client.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{row.client.mobile}</p>
                    <p className="text-sm text-[var(--text-muted)]">{row.brand.name}</p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Delivery: {formatDateLabel(row.estimatedDeliveryDate)}
                    </p>
                    <button
                      type="button"
                      className="mt-3 h-8 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--foreground)] transition hover:bg-[var(--panel-muted)]"
                      onClick={() => handleViewRepair(row)}
                    >
                      View
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[var(--stroke)] md:block">
            <table className="w-full">
              <thead className="bg-[var(--panel-muted)] text-left text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Bill No</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Bat Name</th>
                  <th className="px-4 py-3 font-medium">Mobile</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Estimated Delivery</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={7}>
                      Loading pending deliveries...
                    </td>
                  </tr>
                ) : rowsError ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-rose-300" colSpan={7}>
                      {rowsError}
                    </td>
                  </tr>
                ) : selectedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={7}>
                      No pending deliveries found for the selected date window.
                    </td>
                  </tr>
                ) : (
                  selectedRows.map((row) => {
                    const meta = statusMeta[row.status];
                    return (
                      <tr key={row.id} className="border-t border-[var(--stroke)] text-sm">
                        <td className="px-4 py-3 font-semibold">{row.billNo}</td>
                        <td className="px-4 py-3">{row.client.name}</td>
                        <td className="px-4 py-3">{row.brand.name}</td>
                        <td className="px-4 py-3">{row.client.mobile}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {formatDateLabel(row.estimatedDeliveryDate)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="h-8 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--foreground)] transition hover:bg-[var(--panel)]"
                            onClick={() => handleViewRepair(row)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Showing all matching repairs without pagination.
          </p>
        </div>
      </div>

      {selectedRepair ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={closeRepairModal}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Repair Details
                </p>
                <h3 className="mt-2 text-xl font-semibold">{selectedRepair.billNo}</h3>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  statusMeta[selectedRepair.status].className
                }`}
              >
                {statusMeta[selectedRepair.status].label}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Client</p>
                <p className="mt-2 font-semibold">{selectedRepair.client.name}</p>
                <p className="text-sm text-[var(--text-muted)]">{selectedRepair.client.mobile}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Bat</p>
                <p className="mt-2 font-semibold">{selectedRepair.brand.name}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Intake Type</p>
                <p className="mt-2 font-semibold">
                  {selectedRepair.intakeType === "COURIER" ? "Courier" : "Walk-in"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Estimated Delivery</p>
                <p className="mt-2 font-semibold">{formatDateLabel(selectedRepair.estimatedDeliveryDate)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Store</p>
                <p className="mt-2 font-semibold">{selectedRepair.store?.name ?? "-"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Physical Bill No</p>
                <p className="mt-2 font-semibold">{selectedRepair.physicalBillNo || "-"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Repairs</p>
              {selectedRepair.items && selectedRepair.items.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {selectedRepair.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-3 py-2 text-sm"
                    >
                      <span>
                        {item.repairType
                          ? `${item.repairType.code} - ${item.repairType.name}`
                          : "Repair item"}
                      </span>
                      <span className="font-semibold">{money(item.price)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No repair line items.</p>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Total</p>
                <p className="mt-2 text-lg font-semibold">{money(selectedRepair.totalAmount)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Advance</p>
                <p className="mt-2 text-lg font-semibold">{money(selectedRepair.advanceAmount)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Balance</p>
                <p className="mt-2 text-lg font-semibold">
                  {money(Math.max(0, selectedRepair.totalAmount - selectedRepair.advanceAmount))}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Description</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">
                {selectedRepair.description?.trim() || "No description provided."}
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-5 text-xs text-[var(--foreground)] transition hover:bg-[var(--panel)]"
                onClick={closeRepairModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
