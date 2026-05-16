"use client";

// Categorised account picker — single dropdown listing every active
// chart-of-accounts row, grouped under its category (Assets,
// Liabilities, Equity, Income, Expenses). Used by the Expense
// Voucher form's per-line account picker so the user can post a
// voucher line to ANY account regardless of category (e.g. buying
// an asset, paying an expense, settling a liability, etc.).
//
// Portal-rendered so it escapes overflow:hidden ancestors — same
// pattern as StyledSelect / StyledDatePicker / ReportPicker.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export type CategorizedAccount = {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  typeName: string;
};

type Props = {
  value: string;
  // Returns the selected account (or null if cleared). Caller stores
  // whichever fields are useful.
  onChange: (account: CategorizedAccount | null) => void;
  placeholder?: string;
  // Optional cached label for the trigger (lets the parent display
  // the previous selection across re-mounts without re-fetching).
  displayLabel?: string;
  disabled?: boolean;
};

// Display order for category groups in the dropdown.
const CATEGORY_ORDER = ["ASSET", "LIABILITIES", "EQUITY", "INCOME", "EXPENSES"];

// Friendly group labels + a tiny coloured dot per category.
const CATEGORY_LABEL: Record<string, string> = {
  ASSET: "Assets",
  LIABILITIES: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSES: "Expenses",
};
const CATEGORY_DOT: Record<string, string> = {
  ASSET: "bg-blue-500",
  LIABILITIES: "bg-rose-500",
  EQUITY: "bg-violet-500",
  INCOME: "bg-emerald-500",
  EXPENSES: "bg-amber-500",
};
const CATEGORY_BADGE: Record<string, string> = {
  ASSET: "border-blue-200 bg-blue-50 text-blue-700",
  LIABILITIES: "border-rose-200 bg-rose-50 text-rose-700",
  EQUITY: "border-violet-200 bg-violet-50 text-violet-700",
  INCOME: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPENSES: "border-amber-200 bg-amber-50 text-amber-700",
};

export function CategorizedAccountPicker({
  value,
  onChange,
  placeholder = "Pick an account…",
  displayLabel,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [accounts, setAccounts] = useState<CategorizedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Position the popover under the trigger; recompute on scroll/resize
  useLayoutEffect(() => {
    if (!open) {
      setPopoverRect(null);
      return;
    }
    function compute() {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      // Anchor under trigger; widen a bit since options can be long
      // (code + name). Clamp to viewport.
      const width = Math.max(r.width, 320);
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - width - 8,
      );
      setPopoverRect({ top: r.bottom + 4, left, width });
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  // Outside-click + Escape
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      const inTrigger = ref.current?.contains(target);
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

  // Load accounts when the popover opens for the first time.
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        "/api/accounting/reports/options/accounts?take=500",
        { headers: { "x-portal": "ACCOUNTING" } },
      );
      const j = (await r.json()) as {
        success: boolean;
        data?: { items: CategorizedAccount[] };
        message?: string;
      };
      if (!j.success || !j.data) {
        setError(j.message ?? "Failed to load accounts.");
        return;
      }
      setAccounts(j.data.items);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && accounts.length === 0 && !loading) {
      void fetchAccounts();
    }
  }, [open, accounts.length, loading, fetchAccounts]);

  // Group by category, filter by search.
  const grouped = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const buckets = new Map<string, CategorizedAccount[]>();
    for (const acc of accounts) {
      if (term) {
        const hit =
          acc.code.toLowerCase().includes(term) ||
          acc.name.toLowerCase().includes(term) ||
          acc.categoryName.toLowerCase().includes(term);
        if (!hit) continue;
      }
      const arr = buckets.get(acc.categoryCode) ?? [];
      arr.push(acc);
      buckets.set(acc.categoryCode, arr);
    }
    // Return in display order
    return CATEGORY_ORDER.filter((cat) => buckets.has(cat)).map((cat) => ({
      categoryCode: cat,
      categoryLabel: CATEGORY_LABEL[cat] ?? cat,
      items: buckets.get(cat) ?? [],
    }));
  }, [accounts, searchTerm]);

  const selectedAccount = accounts.find((a) => a.id === value);
  const triggerText = selectedAccount
    ? `${selectedAccount.code} · ${selectedAccount.name}`
    : displayLabel || placeholder;
  const isPlaceholder = !selectedAccount && !displayLabel;
  const selectedCategoryCode = selectedAccount?.categoryCode;

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
            className="max-h-[400px] overflow-hidden rounded-2xl border border-[#e2d8cf] bg-white shadow-[0_14px_38px_rgba(27,24,22,0.10)]"
          >
            <div className="relative border-b border-[#f0e8e0] px-3 py-2">
              <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a59889]" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by code, name or category…"
                autoFocus
                className="h-8 w-full rounded-lg border border-[#e2d8cf] bg-white pl-7 pr-2 text-xs text-[#1f1d1c] outline-none focus:border-[#ff7a12]"
              />
            </div>
            <div className="max-h-[340px] overflow-y-auto py-1 text-sm">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#7b736d]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading accounts…
                </div>
              ) : error ? (
                <div className="px-3 py-3 text-xs text-[#b94f37]">{error}</div>
              ) : grouped.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#9a8f85]">
                  {searchTerm
                    ? `No accounts match "${searchTerm}".`
                    : "No accounts available."}
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.categoryCode}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#f0e8e0] bg-[#faf6f2] px-3 py-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[group.categoryCode] ?? "bg-[#9a8f85]"}`}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b736d]">
                        {group.categoryLabel}
                      </span>
                      <span className="ml-auto text-[10px] text-[#9a8f85]">
                        {group.items.length}
                      </span>
                    </div>
                    {group.items.map((acc) => {
                      const isSelected = acc.id === value;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            onChange(acc);
                            setOpen(false);
                            setSearchTerm("");
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#fff7f0] ${
                            isSelected
                              ? "bg-[#fff5ec] text-[#bb5c12]"
                              : "text-[#1f1d1c]"
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className={`font-mono text-[12px] ${isSelected ? "font-bold" : "font-semibold"}`}>
                              {acc.code}
                            </span>
                            <span className="ml-2 text-[12px] text-[#5f5750]">{acc.name}</span>
                          </span>
                          {isSelected ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-[#ff7a12]" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm transition focus:outline-none ${
          isPlaceholder
            ? "border-[#e2d8cf] text-[#7b736d]"
            : "border-[#e2d8cf] text-[#1f1d1c] hover:border-[#ffcfad]"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="min-w-0 flex-1 truncate">{triggerText}</span>
        {selectedCategoryCode ? (
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${CATEGORY_BADGE[selectedCategoryCode] ?? ""}`}
          >
            {CATEGORY_LABEL[selectedCategoryCode] ?? selectedCategoryCode}
          </span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {popover}
    </div>
  );
}
