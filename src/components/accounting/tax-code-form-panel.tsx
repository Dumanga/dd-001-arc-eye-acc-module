"use client";

import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EXPENSE_ACCOUNT_CATEGORY_CODE,
  TAX_ACCOUNT_CATEGORY_CODES,
  applicableOnOptions,
  calculationOptions,
  statusOptions,
  taxTypeOptions,
  type TaxCodeAccountOptionsPayload,
  type TaxCodeAccountOption,
  type TaxCodeFormValues,
} from "@/lib/accounting/tax-code-types";
import type { ApiResponse } from "@/lib/api/response";

const ACCOUNT_OPTIONS_PAGE_SIZE = 20;

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload.data as T;
}

const initialState: TaxCodeFormValues = {
  taxCode: "",
  taxName: "",
  taxType: "",
  calculation: "Percentage",
  rate: "",
  outputTaxAccount: "",
  inputTaxAccount: "",
  applicableOn: "",
  effectiveFrom: "",
  status: "Active",
};

type TaxCodeFormMode = "create" | "edit";

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-[#3f3a36]">
      {label}
      {required ? <span className="ml-1 text-[#ff7101]">*</span> : null}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label || placeholder;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(320, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(320, maxHeight) - 10) : rect.bottom + 10;

      setPanelStyle({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight,
      });
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`}
        />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {options.map((option) => {
                  const isSelected = value === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                          : "text-[#2d2926] hover:bg-[#fff7f0]"
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span>{option.label}</span>
                      {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function AsyncAccountSelect({
  value,
  selectedOption,
  onSelect,
  placeholder,
  disabled,
  searchPlaceholder,
}: {
  value: string;
  selectedOption: TaxCodeAccountOption | null;
  onSelect: (option: TaxCodeAccountOption) => void;
  placeholder: string;
  disabled?: boolean;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [options, setOptions] = useState<TaxCodeAccountOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeQueryKeyRef = useRef("");
  const selectedLabel = selectedOption?.label || placeholder;

  const loadOptions = useCallback(
    async ({ append, cursor, queryKey }: { append: boolean; cursor: string | null; queryKey: string }) => {
      const params = new URLSearchParams({
        categories: TAX_ACCOUNT_CATEGORY_CODES.join(","),
        limit: String(ACCOUNT_OPTIONS_PAGE_SIZE),
      });

      if (debouncedSearchTerm) {
        params.set("q", debouncedSearchTerm);
      }

      if (cursor) {
        params.set("cursor", cursor);
      }

      const payload = await requestJson<TaxCodeAccountOptionsPayload>(
        `/api/accounting/accounts/options?${params.toString()}`
      );

      if (activeQueryKeyRef.current !== queryKey) {
        return;
      }

      setOptions((current) => {
        if (!append) {
          return payload.items;
        }

        const seen = new Set(current.map((option) => option.id));
        const merged = [...current];

        for (const option of payload.items) {
          if (!seen.has(option.id)) {
            merged.push(option);
            seen.add(option.id);
          }
        }

        return merged;
      });
      setNextCursor(payload.nextCursor);
      setHasMore(payload.hasMore);
    },
    [debouncedSearchTerm]
  );

  const loadFirstPage = useCallback(async () => {
    const queryKey = `${TAX_ACCOUNT_CATEGORY_CODES.join(",")}:${debouncedSearchTerm}`;
    activeQueryKeyRef.current = queryKey;
    setLoading(true);
    setLoadingMore(false);
    setErrorMessage(null);
    setOptions([]);
    setNextCursor(null);
    setHasMore(false);

    try {
      await loadOptions({ append: false, cursor: null, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load accounts.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoading(false);
      }
    }
  }, [debouncedSearchTerm, loadOptions]);

  const loadMore = useCallback(async () => {
    if (!open || loading || loadingMore || !hasMore || !nextCursor) {
      return;
    }

    const queryKey = `${TAX_ACCOUNT_CATEGORY_CODES.join(",")}:${debouncedSearchTerm}`;
    setLoadingMore(true);
    setErrorMessage(null);

    try {
      await loadOptions({ append: true, cursor: nextCursor, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load more accounts.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoadingMore(false);
      }
    }
  }, [debouncedSearchTerm, hasMore, loadOptions, loading, loadingMore, nextCursor, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(200, Math.min(360, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(360, maxHeight) - 10) : rect.bottom + 10;

      setPanelStyle({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight,
      });
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

  useEffect(() => {
    if (!open) {
      activeQueryKeyRef.current = "";
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setOptions([]);
      setNextCursor(null);
      setHasMore(false);
      setErrorMessage(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus();
      setDebouncedSearchTerm(searchTerm.trim());
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [open, searchTerm]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    void loadFirstPage();
  }, [debouncedSearchTerm, disabled, loadFirstPage, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentList = listRef.current;

    if (!currentList) {
      return;
    }

    const listElement = currentList;

    function handleScroll() {
      if (listElement.scrollTop + listElement.clientHeight >= listElement.scrollHeight - 48) {
        void loadMore();
      }
    }

    listElement.addEventListener("scroll", handleScroll);

    return () => {
      listElement.removeEventListener("scroll", handleScroll);
    };
  }, [loadMore, open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`}
        />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="border-b border-[#efe4db] bg-white/90 p-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-[#fffdfa] py-2.5 pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </div>
              </div>
              <div
                ref={listRef}
                className="overflow-y-auto p-2"
                style={{ maxHeight: panelStyle.maxHeight }}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[#7a7068]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                    Loading accounts...
                  </div>
                ) : options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = selectedOption?.id === option.id;

                    const isExpenseAccount = option.categoryCode === EXPENSE_ACCOUNT_CATEGORY_CODE;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onSelect(option);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                          isSelected
                            ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                            : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option.label}</span>
                          {option.groupLabel ? (
                            <span
                              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                isExpenseAccount
                                  ? "bg-[#edf4ff] text-[#315d9b]"
                                  : "bg-[#fff1e2] text-[#b45b12]"
                              }`}
                            >
                              {option.groupLabel}
                            </span>
                          ) : null}
                        </span>
                        {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-[#8a7e74]">
                    {debouncedSearchTerm
                      ? "No matching liability or expense accounts."
                      : "No liability or expense accounts available."}
                  </div>
                )}

                {errorMessage ? (
                  <div className="mx-1 mt-2 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-3 text-sm text-[#b94f37]">
                    <p>{errorMessage}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (options.length === 0) {
                          void loadFirstPage();
                          return;
                        }

                        void loadMore();
                      }}
                      className="mt-2 font-semibold text-[#b45b12]"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}

                {loadingMore ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-[#7a7068]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                    Loading more...
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[#a2978c] ${
        disabled
          ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
          : "border-[#e2d8cf] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
      }`}
    />
  );
}

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

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

function formatCalendarValue(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatCalendarDisplay(value: string) {
  const parsed = parseCalendarDate(value);

  if (!parsed) {
    return "mm/dd/yyyy";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = firstDayOfMonth.getDay();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function DateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseCalendarDate(value);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const monthDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => new Date(), []);
  const todayValue = formatCalendarValue(today);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 340 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(260, Math.min(380, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(360, maxHeight) - 10) : rect.bottom + 10;

      setPanelStyle({
        left: rect.left,
        top,
        width: Math.max(rect.width, 290),
        maxHeight,
      });
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (!open) {
              setViewDate(selectedDate ?? new Date());
            }
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{formatCalendarDisplay(value)}</span>
        <Calendar className="h-4 w-4 shrink-0 text-[#7f746c]" />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="border-b border-[#efe4db] bg-white/90 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1f1d1c]">{getMonthLabel(viewDate)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveMonth(-1)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMonth(1)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4" style={{ maxHeight: panelStyle.maxHeight }}>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                  {calendarWeekdays.map((weekday) => (
                    <div key={weekday} className="py-2">
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1.5">
                  {monthDays.map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="h-10" />;
                    }

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
                        className={`flex h-10 items-center justify-center rounded-2xl text-sm transition ${
                          isSelected
                            ? "bg-[#ff7a12] font-semibold text-white shadow-[0_10px_20px_rgba(255,122,18,0.22)]"
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
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#efe4db] pt-3">
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
                    className="inline-flex items-center rounded-xl border border-[#e7ddd4] bg-white px-3 py-2 text-sm font-semibold text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
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

function RateField({
  value,
  onChange,
  calculation,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  calculation: TaxCodeFormValues["calculation"];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={calculation === "Percentage" ? "Enter rate" : "Enter fixed amount"}
        disabled={disabled}
        className={`w-full rounded-2xl border py-3 text-sm outline-none transition placeholder:text-[#a2978c] ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : "border-[#e2d8cf] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        } ${calculation === "Fixed Amount" ? "px-4" : "pl-4 pr-12"
        }`}
      />
      {calculation === "Percentage" ? (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#7f746c]">
          %
        </span>
      ) : null}
    </div>
  );
}

function StatusField({
  value,
  onChange,
}: {
  value: TaxCodeFormValues["status"];
  onChange: (value: TaxCodeFormValues["status"]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {statusOptions.map((option) => {
        const active = value === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-[22px] border px-4 py-4 text-left transition ${
              active
                ? option === "Active"
                  ? "border-[#bfe4cf] bg-[#effbf4] text-[#176445] shadow-[0_12px_24px_rgba(24,166,106,0.10)]"
                  : "border-[#ffd5c4] bg-[#fff4ee] text-[#b45c1c] shadow-[0_12px_24px_rgba(255,122,18,0.10)]"
                : "border-[#e7ddd4] bg-white text-[#72675f] hover:border-[#e0d2c6] hover:bg-[#fffaf4]"
            }`}
          >
            <p className="text-sm font-semibold">{option}</p>
            <p className="mt-1 text-xs leading-5">
              {option === "Active" ? "Available for live tax assignment." : "Hidden from active assignment flows."}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export function TaxCodeFormPanel({
  formId = "tax-code-create-form",
  mode = "create",
  initialValues,
  initialOutputTaxAccountOption,
  initialInputTaxAccountOption,
  existingTaxCodes,
  onSubmit,
  serverError,
}: {
  formId?: string;
  mode?: TaxCodeFormMode;
  initialValues?: TaxCodeFormValues;
  initialOutputTaxAccountOption?: TaxCodeAccountOption | null;
  initialInputTaxAccountOption?: TaxCodeAccountOption | null;
  existingTaxCodes: string[];
  onSubmit?: (form: TaxCodeFormValues) => void;
  serverError?: string | null;
}) {
  const [form, setForm] = useState<TaxCodeFormValues>(initialValues ?? initialState);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [selectedOutputAccountOption, setSelectedOutputAccountOption] = useState<TaxCodeAccountOption | null>(
    initialOutputTaxAccountOption ?? null
  );
  const [selectedInputAccountOption, setSelectedInputAccountOption] = useState<TaxCodeAccountOption | null>(
    initialInputTaxAccountOption ?? null
  );

  const taxTypeSelectOptions = useMemo(
    () => taxTypeOptions.map((option) => ({ value: option, label: option })),
    []
  );
  const calculationSelectOptions = useMemo(
    () => calculationOptions.map((option) => ({ value: option, label: option })),
    []
  );
  const applicableOnSelectOptions = useMemo(
    () => applicableOnOptions.map((option) => ({ value: option, label: option })),
    []
  );

  const existingCodeSet = useMemo(
    () =>
      new Set(
        existingTaxCodes
          .map((item) => item.trim().toUpperCase())
          .filter((item) => !(mode === "edit" && item === (initialValues?.taxCode.trim().toUpperCase() || "")))
      ),
    [existingTaxCodes, initialValues?.taxCode, mode]
  );
  const outputAccountLabel = selectedOutputAccountOption?.label || "Choose output account";
  const inputAccountLabel = selectedInputAccountOption?.label || "Choose input account";
  const showOutputAccount = form.taxType === "Sales" || form.taxType === "Both";
  const showInputAccount = form.taxType === "Purchase" || form.taxType === "Both";
  const isEditMode = mode === "edit";
  const parsedRate = Number(form.rate);
  const rateError =
    touched.rate && !form.rate
      ? "Rate is required."
      : touched.rate && Number.isNaN(parsedRate)
        ? "Enter a valid numeric rate."
        : touched.rate && form.calculation === "Percentage" && parsedRate <= 0
          ? "Percentage rate must be greater than 0."
          : touched.rate && form.calculation === "Fixed Amount" && parsedRate < 0
            ? "Fixed amount cannot be negative."
            : "";

  const errors = {
    taxCode:
      touched.taxCode && !form.taxCode
        ? "Tax code is required."
        : touched.taxCode && existingCodeSet.has(form.taxCode.trim().toUpperCase())
          ? "This tax code already exists."
          : "",
    taxName: touched.taxName && !form.taxName ? "Tax name is required." : "",
    taxType: touched.taxType && !form.taxType ? "Tax type is required." : "",
    calculation: touched.calculation && !form.calculation ? "Calculation is required." : "",
    rate: rateError,
    outputTaxAccount:
      touched.outputTaxAccount && showOutputAccount && !form.outputTaxAccount
        ? "Output tax account is required."
        : "",
    inputTaxAccount:
      touched.inputTaxAccount && showInputAccount && !form.inputTaxAccount
        ? "Input tax account is required."
        : "",
    applicableOn: touched.applicableOn && !form.applicableOn ? "Applicable on is required." : "",
    effectiveFrom: touched.effectiveFrom && !form.effectiveFrom ? "Effective from date is required." : "",
    status: touched.status && !form.status ? "Status is required." : "",
  };

  const isValid =
    Boolean(form.taxCode) &&
    Boolean(form.taxName) &&
    Boolean(form.taxType) &&
    Boolean(form.calculation) &&
    Boolean(form.rate) &&
    !errors.taxCode &&
    !errors.rate &&
    (!showOutputAccount || Boolean(form.outputTaxAccount)) &&
    (!showInputAccount || Boolean(form.inputTaxAccount)) &&
    Boolean(form.applicableOn) &&
    Boolean(form.effectiveFrom) &&
    Boolean(form.status);

  function updateField<K extends keyof TaxCodeFormValues>(key: K, value: TaxCodeFormValues[K]) {
    setForm((current) => {
      if (key === "taxType") {
        return {
          ...current,
          taxType: value as TaxCodeFormValues["taxType"],
          outputTaxAccount: value === "Purchase" ? "" : current.outputTaxAccount,
          inputTaxAccount: value === "Sales" ? "" : current.inputTaxAccount,
        };
      }

      if (key === "calculation") {
        return {
          ...current,
          calculation: value as TaxCodeFormValues["calculation"],
          rate: "",
        };
      }

      return { ...current, [key]: value };
    });
  }

  function handleTaxTypeChange(value: TaxCodeFormValues["taxType"]) {
    if (value === "Purchase") {
      setSelectedOutputAccountOption(null);
    }

    if (value === "Sales") {
      setSelectedInputAccountOption(null);
    }

    updateField("taxType", value);
  }

  function handleOutputAccountSelect(option: TaxCodeAccountOption) {
    setSelectedOutputAccountOption(option);
    updateField("outputTaxAccount", option.id);
  }

  function handleInputAccountSelect(option: TaxCodeAccountOption) {
    setSelectedInputAccountOption(option);
    updateField("inputTaxAccount", option.id);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      taxCode: true,
      taxName: true,
      taxType: true,
      calculation: true,
      rate: true,
      outputTaxAccount: true,
      inputTaxAccount: true,
      applicableOn: true,
      effectiveFrom: true,
      status: true,
    });

    if (!isValid) {
      return;
    }

    onSubmit?.({
      ...form,
      taxCode: form.taxCode.trim().toUpperCase(),
      taxName: form.taxName.trim(),
    });
  }

  return (
    <div className="grid gap-6">
      <form
        id={formId}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] shadow-[0_18px_42px_rgba(27,24,22,0.05)]"
      >
        <div className="grid gap-6 p-6">
          {serverError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {serverError}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[26px] border border-[#ece2d8] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7ef_100%)] p-5">
              <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Tax code details</h3>
              <p className="mt-2 text-sm leading-6 text-[#766c64]">
                {isEditMode
                  ? "Tax setup fields are locked in edit mode. Only the tax name and status can be changed here."
                  : "Define tax identity, usage scope, calculation method, and linked accounts."}
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel label="Tax Code" required />
                  <TextField
                    value={form.taxCode}
                    onChange={(value) => updateField("taxCode", value.toUpperCase())}
                    placeholder="Enter tax code"
                    maxLength={20}
                    disabled={isEditMode}
                  />
                  {errors.taxCode ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.taxCode}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Tax Name" required />
                  <TextField
                    value={form.taxName}
                    onChange={(value) => updateField("taxName", value)}
                    placeholder="Enter tax name"
                    maxLength={50}
                  />
                  {errors.taxName ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.taxName}</p> : null}
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel label="Calculation" required />
                  <SelectField
                    value={form.calculation}
                    onChange={(value) => updateField("calculation", value as TaxCodeFormValues["calculation"])}
                    options={calculationSelectOptions}
                    placeholder="Select calculation"
                    disabled={isEditMode}
                  />
                  {errors.calculation ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.calculation}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Rate" required />
                  <RateField
                    value={form.rate}
                    onChange={(value) => updateField("rate", value)}
                    calculation={form.calculation}
                    disabled={isEditMode}
                  />
                  <p className={`mt-2 text-xs ${errors.rate ? "font-medium text-[#c75b1a]" : "text-[#8c8076]"}`}>
                    {errors.rate ||
                      (form.calculation === "Percentage"
                        ? "Enter the numeric percentage only."
                        : "Enter the fixed amount value.")}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <FieldLabel label="Tax Type" required />
                <SelectField
                  value={form.taxType}
                  onChange={(value) => handleTaxTypeChange(value as TaxCodeFormValues["taxType"])}
                  options={taxTypeSelectOptions}
                  placeholder="Select tax type"
                  disabled={isEditMode}
                />
                {errors.taxType ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.taxType}</p> : null}
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {showOutputAccount ? (
                  <div>
                    <FieldLabel label="Output Tax Account (Sales)" required />
                    <AsyncAccountSelect
                      value={form.outputTaxAccount}
                      selectedOption={selectedOutputAccountOption}
                      onSelect={handleOutputAccountSelect}
                      placeholder="Select output account"
                      disabled={isEditMode}
                      searchPlaceholder="Search liability and expense accounts"
                    />
                    {errors.outputTaxAccount ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.outputTaxAccount}</p> : null}
                  </div>
                ) : null}
                {showInputAccount ? (
                  <div>
                    <FieldLabel label="Input Tax Account (Purchase)" required />
                    <AsyncAccountSelect
                      value={form.inputTaxAccount}
                      selectedOption={selectedInputAccountOption}
                      onSelect={handleInputAccountSelect}
                      placeholder="Select input account"
                      disabled={isEditMode}
                      searchPlaceholder="Search liability and expense accounts"
                    />
                    {errors.inputTaxAccount ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.inputTaxAccount}</p> : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel label="Applicable On" required />
                  <SelectField
                    value={form.applicableOn}
                    onChange={(value) => updateField("applicableOn", value as TaxCodeFormValues["applicableOn"])}
                    options={applicableOnSelectOptions}
                    placeholder="Select applicability"
                    disabled={isEditMode}
                  />
                  {errors.applicableOn ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.applicableOn}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Effective From" required />
                  <DateField
                    value={form.effectiveFrom}
                    onChange={(value) => updateField("effectiveFrom", value)}
                    disabled={isEditMode}
                  />
                  {errors.effectiveFrom ? <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.effectiveFrom}</p> : null}
                </div>
              </div>

              <div className="mt-5">
                <FieldLabel label="Status" required />
                <StatusField value={form.status} onChange={(value) => updateField("status", value)} />
              </div>
            </div>

            <div className="grid gap-5">
              <div className="rounded-[26px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fffaf4_100%)] p-5">
                <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">Preview</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Identity</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {form.taxCode || "NEW-TAX"} {form.taxName || "Tax name"}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Applies To</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {form.taxType || "Not selected"} / {form.applicableOn || "Not selected"}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Rate</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {form.rate ? (form.calculation === "Percentage" ? `${form.rate}%` : form.rate) : "Not entered"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fff8f0_100%)] p-5">
                <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">Posting guide</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Sales Posting</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {showOutputAccount ? outputAccountLabel : "Not required for current tax type"}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Purchase Posting</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {showInputAccount ? inputAccountLabel : "Not required for current tax type"}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Status</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{form.status}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <section className="relative overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(135deg,#fffaf5_0%,#fff4e8_52%,#fff0e1_100%)] p-6 shadow-[0_18px_42px_rgba(27,24,22,0.05)]">
        <div className="absolute right-[-2rem] top-[-2rem] h-32 w-32 rounded-full bg-[#ffd9bb]/65 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#ffd9bb] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#ff7101]">
              <Sparkles className="h-3.5 w-3.5" />
              {isEditMode ? "Tax Update" : "Tax Setup"}
            </p>
            <h2 className="mt-3 font-sans text-[2rem] font-semibold tracking-[-0.04em] text-[#1f1d1c]">
              {isEditMode ? "Edit tax name and status" : "Create a new tax code"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#72675f]">
              {isEditMode
                ? "The tax structure stays locked after creation. Use this workspace only to update the displayed tax name or activation status."
                : "Use this inline workspace to define tax behavior for sales, purchases, or both, while mapping it back to the correct ledger accounts."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/70 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Calculation</p>
              <p className="mt-2 text-base font-semibold text-[#1f1d1c]">Percentage or fixed</p>
              <p className="mt-1 text-sm leading-6 text-[#7a7068]">Rate behavior changes based on the selected calculation mode.</p>
            </div>
            <div className="rounded-[22px] border border-white/70 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Posting</p>
              <p className="mt-2 text-base font-semibold text-[#1f1d1c]">Conditional ledger mapping</p>
              <p className="mt-1 text-sm leading-6 text-[#7a7068]">Sales, purchase, or both automatically determines which tax account fields appear.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
