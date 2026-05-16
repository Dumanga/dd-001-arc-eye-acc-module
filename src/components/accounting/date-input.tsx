"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function formatCalendarValue(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatCalendarDisplay(value: string, placeholder: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return placeholder;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = firstDayOfMonth.getDay();
  const cells: Array<Date | null> = [];
  for (let index = 0; index < leadingEmptyDays; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateInput({
  value,
  onChange,
  disabled = false,
  placeholder = "Select date",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number; width: number } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseCalendarDate(value);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const monthDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => new Date(), []);
  const todayValue = formatCalendarValue(today);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 300 && spaceAbove > spaceBelow;
      const panelHeight = 306;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - 32);
      const left = Math.min(Math.max(16, rect.left), viewportWidth - width - 16);
      const rawTop = openUpward ? rect.top - panelHeight - 8 : rect.bottom + 8;
      const top = Math.min(Math.max(16, rawTop), viewportHeight - panelHeight - 16);
      setPanelStyle({ left, top, width });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  function moveMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function moveYear(offset: number) {
    setViewDate((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (!open) setViewDate(selectedDate ?? new Date());
            setOpen((current) => !current);
          }
        }}
        className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#dfd4ca] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>
          {formatCalendarDisplay(value, placeholder)}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#7f746c]" />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-[18px] border border-[#e7ddd4] bg-white shadow-[0_18px_42px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="border-b border-[#efe4db] bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1f1d1c]">{getMonthLabel(viewDate)}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveYear(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Previous year"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMonth(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMonth(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveYear(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Next year"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold uppercase text-[#8e7f72]">
                  {calendarWeekdays.map((weekday) => (
                    <div key={weekday} className="py-0.5">
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-0.5">
                  {monthDays.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="h-7" />;
                    const dayValue = formatCalendarValue(day);
                    const isSelected = value === dayValue;
                    const isToday = todayValue === dayValue;
                    return (
                      <button
                        key={dayValue}
                        type="button"
                        onClick={() => {
                          onChange(dayValue);
                          setOpen(false);
                        }}
                        className={`flex h-7 items-center justify-center rounded-lg text-sm transition ${
                          isSelected
                            ? "bg-[#ff7a12] font-semibold text-white shadow-[0_8px_16px_rgba(255,122,18,0.22)]"
                            : isToday
                              ? "border border-[#ffd6b7] bg-[#fff4ea] font-semibold text-[#b45b12]"
                              : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#efe4db] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(todayValue);
                      setViewDate(today);
                    }}
                    className="text-sm font-semibold text-[#b45b12] transition hover:text-[#ff7101]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center rounded-xl border border-[#e7ddd4] bg-white px-3 py-1 text-sm font-semibold text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
