"use client";

// Tailwind-styled date picker — a button that opens a calendar grid
// in a portal-rendered popover. Replacement for the native
// `<input type="date">` which renders inconsistently across browsers
// and ignores most Tailwind classes.
//
// Value format: `YYYY-MM-DD` (same as the HTML date input) so this
// is a drop-in replacement.
//
// Portal-rendered (createPortal into document.body) so the calendar
// escapes any ancestor with `overflow: hidden` — same problem the
// ReportPicker had, same fix.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Optional className for the trigger button (lets callers blend the
  // picker into varying card backgrounds).
  triggerClassName?: string;
  // Show a small X to clear the date (when cleared, value becomes "").
  allowClear?: boolean;
  // Disable user input.
  disabled?: boolean;
};

// ─── Date helpers ────────────────────────────────────────────────

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCalendarDays(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatDisplay(value: string): string {
  const d = parseDateValue(value);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Main component ──────────────────────────────────────────────

export function StyledDatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  triggerClassName,
  allowClear = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Track which month the calendar is currently showing.
  const initialMonth = useMemo(() => {
    const d = parseDateValue(value) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [value]);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);

  // When the dropdown opens, reset to show the selected month.
  useEffect(() => {
    if (!open) return;
    const d = parseDateValue(value);
    if (d) setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [open, value]);

  // Position the popover under the trigger, recompute on scroll/resize.
  useLayoutEffect(() => {
    if (!open) {
      setPopoverRect(null);
      return;
    }
    function compute() {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      // Calendar popover is ~336px wide; align left edge but clamp to
      // viewport so it doesn't bleed off the right side of small screens.
      const desiredLeft = Math.min(r.left, window.innerWidth - 348);
      setPopoverRect({
        top: r.bottom + 6,
        left: Math.max(8, desiredLeft),
        width: 336,
      });
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  // Outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moveMonth = useCallback(
    (offset: number) =>
      setVisibleMonth(
        (curr) => new Date(curr.getFullYear(), curr.getMonth() + offset, 1),
      ),
    [],
  );
  const moveYear = useCallback(
    (offset: number) =>
      setVisibleMonth(
        (curr) => new Date(curr.getFullYear() + offset, curr.getMonth(), 1),
      ),
    [],
  );

  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const monthLabel = visibleMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const todayValue = toDateValue(new Date());

  const navBtnClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#eadfd5] text-[#6d625a] transition hover:bg-[#fff7f0]";

  const displayLabel = value ? formatDisplay(value) : "";

  const popover =
    open && popoverRect && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverRect.top,
              left: popoverRect.left,
              width: popoverRect.width,
              zIndex: 100,
            }}
            className="rounded-2xl border border-[#eadfd5] bg-white p-3 shadow-[0_22px_54px_rgba(42,34,28,0.15)]"
          >
            {/* Month/year nav */}
            <div className="mb-3 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => moveYear(-1)}
                className={navBtnClass}
                aria-label="Previous year"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className={navBtnClass}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="flex-1 text-center text-sm font-semibold text-[#1f1d1c]">
                {monthLabel}
              </p>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className={navBtnClass}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveYear(1)}
                className={navBtnClass}
                aria-label="Next year"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#95877c]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            {/* Day grid */}
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayValue = toDateValue(day);
                const inVisibleMonth =
                  day.getMonth() === visibleMonth.getMonth();
                const selected = dayValue === value;
                const today = dayValue === todayValue;
                return (
                  <button
                    key={dayValue}
                    type="button"
                    onClick={() => {
                      onChange(dayValue);
                      setOpen(false);
                    }}
                    className={`h-9 rounded-lg text-sm font-semibold transition ${
                      selected
                        ? "bg-[#ff7a12] text-white shadow-[0_8px_16px_rgba(255,122,18,0.22)]"
                        : today
                          ? "border border-[#ffcfaa] bg-[#fff7f0] text-[#a95915]"
                          : inVisibleMonth
                            ? "text-[#3f3833] hover:bg-[#fff4e8]"
                            : "text-[#c0b5ab] hover:bg-[#fffaf5]"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Footer — Today shortcut + Clear if allowed */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0e8e0] pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(todayValue);
                  setOpen(false);
                }}
                className="text-xs font-semibold text-[#ff7a12] hover:underline"
              >
                Today
              </button>
              {allowClear && value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#9a8f85] hover:text-[#b94f37]"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          triggerClassName ??
          `flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm transition focus:outline-none ${
            value
              ? "border-[#e2d8cf] text-[#1f1d1c] hover:border-[#ffcfad]"
              : "border-[#e2d8cf] text-[#7b736d] hover:border-[#ffcfad]"
          } disabled:cursor-not-allowed disabled:opacity-60`
        }
      >
        <span className="truncate">{displayLabel || placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#9a8f85]" />
      </button>
      {popover}
    </>
  );
}
