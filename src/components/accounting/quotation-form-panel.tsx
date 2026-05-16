"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";
import type { QuotationProductOption } from "@/app/api/accounting/products/quotation-options/route";
import type { ClientOption } from "@/app/api/accounting/clients/options/route";
import { CustomerQuickCreateModal } from "@/components/accounting/customer-quick-create-modal";

export type QuotationTax = {
  code: string;
  name: string;
  rate: string;
  method: "PERCENTAGE" | "FIXED_AMOUNT";
};

export type QuotationLineDraft = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemLabel: string;
  description: string;
  quantity: string;
  price: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
};

export function isQuotationQtyValid(qty: string, minQty: string): boolean {
  const q = Number(qty);
  const m = Number(minQty);
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isFinite(m) || m <= 0) return q > 0;
  const ratio = q / m;
  const rounded = Math.round(ratio);
  return rounded > 0 && Math.abs(ratio - rounded) <= 1e-6;
}

export type QuotationCustomerOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
  taxes: QuotationTax[];
};

export type QuotationItemOption = QuotationProductOption;

export type QuotationDraft = {
  quotationNumber: string;
  customerRef: string;
  preparedBy: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  discount: string;
  notes: string;
  terms: string;
  customer: QuotationCustomerOption | null;
  lines: QuotationLineDraft[];
};

type QuotationFormPanelProps = {
  formId: string;
  draft: QuotationDraft;
  onChange: (draft: QuotationDraft) => void;
  onSubmit: (draft: QuotationDraft) => void;
};

function decimalAmount(value: string) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTaxLabel(tax: QuotationTax) {
  if (tax.method === "PERCENTAGE") {
    const rate = Number(tax.rate);
    const rateStr = Number.isFinite(rate)
      ? rate % 1 === 0
        ? rate.toString()
        : rate.toFixed(2).replace(/\.?0+$/, "")
      : tax.rate;
    return `${tax.code} ${rateStr}%`;
  }
  return `${tax.code} (flat)`;
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-2 block text-sm font-semibold text-[#4b433d]">{label}</label>;
}

const inputShellClass =
  "min-h-12 w-full rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-left text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]";

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={inputShellClass}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

function NumericInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^0-9.]/g, "");
        const parts = raw.split(".");
        const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
        onChange(normalized);
      }}
      placeholder={placeholder}
      className={inputShellClass}
    />
  );
}

// ─── Async paginated item select ─────────────────────────────────────────────

const ITEM_PAGE_SIZE = 20;

type AsyncItemSelectProps = {
  selectedItem: QuotationItemOption | null;
  onSelect: (item: QuotationItemOption) => void;
};

function AsyncItemSelect({ selectedItem, onSelect }: AsyncItemSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<QuotationItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const skipRef = useRef(0);
  const queryRef = useRef("");
  const loadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async (q: string, skip: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, skip: String(skip), take: String(ITEM_PAGE_SIZE) });
      const res = await fetch(`/api/accounting/products/quotation-options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: QuotationItemOption[]; hasMore: boolean } | null;
      };
      if (payload.success && payload.data) {
        const fetched = payload.data.items;
        setHasMore(payload.data.hasMore);
        skipRef.current = skip + fetched.length;
        if (append) {
          setItems((prev) => [...prev, ...fetched]);
        } else {
          setItems(fetched);
        }
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery("");
    queryRef.current = "";
    skipRef.current = 0;
    setItems([]);
    void fetchItems("", 0, false);
  }

  function handleSearch(q: string) {
    setQuery(q);
    queryRef.current = q;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      skipRef.current = 0;
      setItems([]);
      void fetchItems(q, 0, false);
    }, 300);
  }

  function handleScroll() {
    const list = listRef.current;
    if (!list || loadingRef.current || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = list;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      void fetchItems(queryRef.current, skipRef.current, true);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        className={`${inputShellClass} flex items-center justify-between gap-3`}
      >
        <span className={`truncate ${selectedItem ? "text-[#1f1d1c]" : "text-[#a1968c]"}`}>
          {selectedItem ? `${selectedItem.code} — ${selectedItem.name}` : "Select item"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#a1968c] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[20px] border border-[#eadfd5] bg-white shadow-[0_16px_32px_rgba(42,34,28,0.12)]">
          <div className="border-b border-[#f0e5dc] p-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a09287]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by code or name"
                className="h-9 w-full rounded-xl border border-[#eadfd5] bg-[#fffaf5] pl-9 pr-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:bg-white"
              />
            </label>
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1.5" onScroll={handleScroll}>
            {items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-start justify-between gap-2 rounded-[16px] px-3 py-2.5 text-left transition ${
                    isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {item.code} — {item.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#8c7f74]">
                      {item.uomName} · {item.uomBase}
                    </span>
                  </span>
                  {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#a95915]" /> : null}
                </button>
              );
            })}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-[#9b7a61]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : null}
            {!loading && items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[#7f746d]">
                {query ? "No items match your search." : "No items available."}
              </div>
            ) : null}
            {!loading && hasMore ? (
              <div className="px-3 py-2 text-center text-xs text-[#9b7a61]">
                Scroll down to load more…
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Async customer picker (inline card panel) ────────────────────────────────

const PARTY_PAGE_SIZE = 20;

type AsyncCustomerPickerProps = {
  selected: QuotationCustomerOption | null;
  onSelect: (customer: QuotationCustomerOption) => void;
  onClose: () => void;
  // Parent-provided "+ Add" handler. The current search term is
  // passed so the popup can pre-fill the new-customer name field.
  onAddNew?: (query: string) => void;
};

function AsyncCustomerPicker({ selected, onSelect, onClose, onAddNew }: AsyncCustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const skipRef = useRef(0);
  const queryRef = useRef("");
  const loadingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCustomers = useCallback(async (q: string, skip: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, skip: String(skip), take: String(PARTY_PAGE_SIZE) });
      const res = await fetch(`/api/accounting/clients/options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: ClientOption[]; hasMore: boolean } | null;
      };
      if (payload.success && payload.data) {
        const fetched = payload.data.items;
        setHasMore(payload.data.hasMore);
        skipRef.current = skip + fetched.length;
        if (append) {
          setCustomers((prev) => [...prev, ...fetched]);
        } else {
          setCustomers(fetched);
        }
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    skipRef.current = 0;
    setCustomers([]);
    void fetchCustomers("", 0, false);
  }, [fetchCustomers]);

  function handleSearch(q: string) {
    setQuery(q);
    queryRef.current = q;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      skipRef.current = 0;
      setCustomers([]);
      void fetchCustomers(q, 0, false);
    }, 300);
  }

  function handleScroll() {
    const list = listRef.current;
    if (!list || loadingRef.current || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = list;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      void fetchCustomers(queryRef.current, skipRef.current, true);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
      <div className="border-b border-[#f0e5dc] p-3">
        <div className="flex items-center gap-2">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Search customers"
              className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
          {onAddNew ? (
            <button
              type="button"
              onClick={() => onAddNew(query)}
              title="Add new customer"
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#ff7101] px-3.5 text-xs font-semibold text-white transition hover:bg-[#ea6a08]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto p-2" onScroll={handleScroll}>
        {customers.map((c) => {
          const isSelected = selected?.id === c.id;
          const detail =
            [c.contact, c.city].filter((v) => v.trim()).join(" · ") || "No contact details";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect({ id: c.id, code: "", name: c.name, contact: c.contact, city: c.city, currency: c.currency, taxes: [] });
                onClose();
              }}
              className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">{detail}</span>
              </span>
              {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#9b7a61]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : null}
        {!loading && customers.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No customers found.</div>
        ) : null}
        {!loading && hasMore ? (
          <div className="border-t border-[#f0e5dc] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">
            Scroll to load more…
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main form component ──────────────────────────────────────────────────────

export function QuotationFormPanel({
  formId,
  draft,
  onChange,
  onSubmit,
}: QuotationFormPanelProps) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerQuickOpen, setCustomerQuickOpen] = useState(false);
  const [customerQuickDefaultName, setCustomerQuickDefaultName] = useState("");
  const [selectedItem, setSelectedItem] = useState<QuotationItemOption | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [linePrice, setLinePrice] = useState("0.00");
  const [lineDescription, setLineDescription] = useState("");
  const [lineUomName, setLineUomName] = useState("");
  const [lineUomBase, setLineUomBase] = useState("");
  const [lineUomMinQty, setLineUomMinQty] = useState("1");
  const [uomInfoOpen, setUomInfoOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineQtyError, setLineQtyError] = useState<string | null>(null);

  const subtotal = useMemo(
    () =>
      draft.lines.reduce((sum, line) => sum + decimalAmount(line.quantity) * decimalAmount(line.price), 0),
    [draft.lines]
  );
  const discountAmount = decimalAmount(draft.discount);
  const afterDiscount = Math.max(0, subtotal - discountAmount);

  const taxBreakdown = useMemo(() => {
    const breakdown: Array<{
      code: string;
      name: string;
      rate: string;
      method: "PERCENTAGE" | "FIXED_AMOUNT";
      amount: number;
      base: number;
    }> = [];
    const customerTaxes = draft.customer?.taxes ?? [];
    let runningBase = afterDiscount;
    for (const tax of customerTaxes) {
      const rateNum = decimalAmount(tax.rate);
      const amount =
        tax.method === "PERCENTAGE" ? (runningBase * rateNum) / 100 : rateNum;
      breakdown.push({ code: tax.code, name: tax.name, rate: tax.rate, method: tax.method, amount, base: runningBase });
      runningBase += amount;
    }
    return breakdown;
  }, [draft.customer?.taxes, afterDiscount]);
  const totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
  const grandTotal = afterDiscount + totalTax;

  function updateDraft(patch: Partial<QuotationDraft>) {
    onChange({ ...draft, ...patch });
  }

  function handleItemSelect(item: QuotationItemOption) {
    setSelectedItem(item);
    setLinePrice(item.price);
    setLineDescription(item.name);
    setLineUomName(item.uomName);
    setLineUomBase(item.uomBase);
    setLineUomMinQty(item.uomMinQty);
    setLineQtyError(null);
    setUomInfoOpen(false);
  }

  function addLineItem() {
    if (!selectedItem) return;
    const qty = lineQty || lineUomMinQty || "1";
    if (!isQuotationQtyValid(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
    setLineQtyError(null);
    const nextLine: QuotationLineDraft = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemCode: selectedItem.code,
      itemName: selectedItem.name,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription || selectedItem.name,
      quantity: qty,
      price: linePrice || selectedItem.price,
      uomName: lineUomName,
      uomBase: lineUomBase,
      uomMinQty: lineUomMinQty || "1",
    };
    updateDraft({ lines: [...draft.lines, nextLine] });
    setLineQty(selectedItem.uomMinQty || "1");
    setLinePrice(selectedItem.price);
    setLineDescription(selectedItem.name);
  }

  function removeLineItem(lineId: string) {
    updateDraft({ lines: draft.lines.filter((line) => line.id !== lineId) });
    if (editingLineId === lineId) cancelEdit();
  }

  function startEditLine(line: QuotationLineDraft) {
    setSelectedItem({
      id: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      description: "",
      price: line.price,
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomCode: "",
      uomMinQty: line.uomMinQty,
    });
    setLineQty(line.quantity);
    setLinePrice(line.price);
    setLineDescription(line.description);
    setLineUomName(line.uomName);
    setLineUomBase(line.uomBase);
    setLineUomMinQty(line.uomMinQty);
    setEditingLineId(line.id);
    setUomInfoOpen(false);
  }

  function cancelEdit() {
    setEditingLineId(null);
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDescription("");
    setLineUomName("");
    setLineUomBase("");
    setLineUomMinQty("1");
    setUomInfoOpen(false);
  }

  function updateLineItem() {
    if (!editingLineId || !selectedItem) return;
    const qty = lineQty || lineUomMinQty || "1";
    if (!isQuotationQtyValid(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
    setLineQtyError(null);
    updateDraft({
      lines: draft.lines.map((line) =>
        line.id === editingLineId
          ? {
              ...line,
              itemId: selectedItem.id,
              itemCode: selectedItem.code,
              itemName: selectedItem.name,
              itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
              description: lineDescription,
              quantity: qty,
              price: linePrice || selectedItem.price,
              uomName: lineUomName,
              uomBase: lineUomBase,
              uomMinQty: lineUomMinQty || "1",
            }
          : line
      ),
    });
    setEditingLineId(null);
    setLineQty("1");
    setLinePrice(selectedItem.price);
    setLineDescription(selectedItem.name);
    setUomInfoOpen(false);
  }

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <SurfaceCard overflow="visible">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="flex h-full flex-col">
            <div className="flex h-full flex-col rounded-[28px] border border-dashed border-[#ffd7b9] bg-[linear-gradient(135deg,#fffaf4_0%,#fff3e8_100%)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">Customer</p>
                  <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                    {draft.customer ? draft.customer.name : "Add Customer"}
                  </h3>
                  {!draft.customer ? (
                    <p className="mt-1 text-sm text-[#7f746d]">
                      Choose a customer from the register to start preparing this quotation.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerPicker((current) => !current)}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffcfaa] bg-white text-[#ff7101] transition hover:bg-[#fff5ec]"
                  aria-label="Select customer"
                >
                  <UserPlus className="h-5 w-5" />
                </button>
              </div>

              {draft.customer && !showCustomerPicker ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "Contact", value: draft.customer.contact },
                    { label: "Location", value: draft.customer.city },
                    { label: "Currency", value: draft.currency || "LKR" },
                  ]
                    .filter(({ value }) => value.trim())
                    .map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-[18px] border border-[#ece2d8] bg-white/70 px-3 py-2.5"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">
                          {label}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#1f1d1c]">{value}</p>
                      </div>
                    ))}
                </div>
              ) : null}

              {showCustomerPicker ? (
                <AsyncCustomerPicker
                  selected={draft.customer}
                  onSelect={(customer) => {
                    updateDraft({ customer, currency: customer.currency });
                  }}
                  onClose={() => setShowCustomerPicker(false)}
                  onAddNew={(currentQuery) => {
                    setCustomerQuickDefaultName(currentQuery);
                    setCustomerQuickOpen(true);
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel label="Quote Number" />
                <TextInput value={draft.quotationNumber} onChange={(value) => updateDraft({ quotationNumber: value })} placeholder="QT-2401" />
              </div>
              <div>
                <FieldLabel label="Customer Ref" />
                <TextInput value={draft.customerRef} onChange={(value) => updateDraft({ customerRef: value })} placeholder="Customer reference" />
              </div>
              <div>
                <FieldLabel label="Quote Date" />
                <DateInput value={draft.quotationDate} onChange={(value) => updateDraft({ quotationDate: value })} />
              </div>
              <div>
                <FieldLabel label="Valid Until" />
                <DateInput value={draft.validUntil} onChange={(value) => updateDraft({ validUntil: value })} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel label="Prepared By" />
                <TextInput value={draft.preparedBy} onChange={(value) => updateDraft({ preparedBy: value })} placeholder="Sales rep / preparer name" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <ReceiptText className="h-4 w-4 text-[#ff7101]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Lines</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.lines.length}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <Sparkles className="h-4 w-4 text-[#8b47ff]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Valid</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.validUntil || "Not set"}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <CalendarDays className="h-4 w-4 text-[#18a66a]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Date</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.quotationDate || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Quotation Items"
        description="Add products from the inventory register, then set quantity and rate before sending the quote to the customer."
        overflow="visible"
      >
        <div className="grid gap-4">
          <div className={`grid gap-3 rounded-[24px] border p-4 xl:grid-cols-[1.3fr_1fr_0.45fr_0.65fr_auto] ${editingLineId ? "border-[#ffba82] bg-[#fff8f0]" : "border-[#e9dfd5] bg-[#fffaf5]"}`}>
            <div>
              <FieldLabel label="Item" />
              <AsyncItemSelect selectedItem={selectedItem} onSelect={handleItemSelect} />
            </div>
            <div>
              <FieldLabel label="Description" />
              <TextInput value={lineDescription} onChange={setLineDescription} placeholder="Item description" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[#4b433d]">Qty</span>
                {lineUomName ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setUomInfoOpen((v) => !v)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#dfd4ca] bg-white text-[10px] font-bold text-[#9b8f87] transition hover:border-[#ffba82] hover:text-[#ff7101]"
                      aria-label="Unit of measure info"
                    >
                      ?
                    </button>
                    {uomInfoOpen ? (
                      <div className="absolute left-6 top-0 z-50 w-56 rounded-[18px] border border-[#eadfd5] bg-white p-3 shadow-[0_16px_36px_rgba(42,34,28,0.13)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">Unit of Measure</p>
                        <p className="mt-1.5 text-sm font-semibold text-[#1f1d1c]">{lineUomName}</p>
                        <p className="mt-1 text-xs text-[#7a6f67]">Base unit: <span className="font-semibold text-[#1f1d1c]">{lineUomBase}</span></p>
                        <p className="mt-1 text-xs text-[#7a6f67]">Min qty: <span className="font-semibold text-[#1f1d1c]">{lineUomMinQty}</span></p>
                        <p className="mt-2 text-xs leading-4 text-[#8c7f74]">Enter quantity in <span className="font-semibold">{lineUomBase}</span>.</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <NumericInput
                value={lineQty}
                onChange={(value) => { setLineQty(value); if (lineQtyError) setLineQtyError(null); }}
                placeholder={lineUomMinQty || "1"}
              />
              {lineQtyError ? (
                <p className="mt-1 text-xs text-[#c95d37]">{lineQtyError}</p>
              ) : (
                <p className="mt-1 text-xs text-[#9b8f87]">
                  Min: {lineUomMinQty || "1"} {lineUomBase || "unit"} · enter multiples of this value
                </p>
              )}
            </div>
            <div>
              <FieldLabel label="Rate" />
              <NumericInput value={linePrice} onChange={setLinePrice} placeholder="0.00" />
            </div>
            <div className="flex flex-col">
              <span className="mb-2 block h-5 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={editingLineId ? updateLineItem : addLineItem}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff7a12] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
              >
                {editingLineId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingLineId ? "Update" : "Add Item"}
              </button>
              {editingLineId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border border-[#dfd4ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#6f665f] transition hover:bg-[#f5f0ec]"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-[#ddd8d1] bg-white">
            {draft.lines.length ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[960px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[24%]" />
                      <col className="w-[8%]" />
                      <col className="w-[9%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[8%]" />
                      <col className="w-[3%]" />
                    </colgroup>
                    <thead className="bg-[#faf6f1]">
                      <tr className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f7e72]">
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Description</th>
                        <th className="px-4 py-3 text-center">UOM</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-3 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line, index) => (
                        <tr
                          key={line.id}
                          className={`border-t border-[#ece6df] text-sm text-[#1f1d1c] ${
                            editingLineId === line.id
                              ? "bg-[#fff8f0] ring-2 ring-inset ring-[#ffba82]"
                              : index % 2 === 0
                                ? "bg-white"
                                : "bg-[#fffcf9]"
                          }`}
                        >
                          <td className="px-4 py-4 align-middle">
                            <p className="font-semibold leading-5">{line.itemLabel}</p>
                          </td>
                          <td className="px-4 py-4 align-middle text-[#776d66]">
                            <p className="leading-5">{line.description}</p>
                          </td>
                          <td className="px-4 py-4 text-center align-middle">
                            <span className="inline-flex items-center rounded-full border border-[#e2d8cf] bg-[#faf6f1] px-2 py-0.5 text-[11px] font-semibold text-[#7c6f65]">
                              {line.uomBase || line.uomName || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right align-middle tabular-nums">{line.quantity}</td>
                          <td className="px-4 py-4 text-right align-middle tabular-nums">
                            {formatCurrency(decimalAmount(line.price), draft.currency)}
                          </td>
                          <td className="px-4 py-4 text-right align-middle font-semibold tabular-nums">
                            {formatCurrency(decimalAmount(line.quantity) * decimalAmount(line.price), draft.currency)}
                          </td>
                          <td className="px-3 py-4 text-right align-middle">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditLine(line)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d7e2f5] bg-[#f1f5ff] text-[#3262c9] transition hover:bg-[#e5edff]"
                                aria-label="Edit line item"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLineItem(line.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ecd7cb] bg-[#fff7f1] text-[#c16233] transition hover:bg-[#fff0e5]"
                                aria-label="Remove line item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 p-3 md:hidden">
                  {draft.lines.map((line) => (
                    <div
                      key={line.id}
                      className={`rounded-[20px] border p-4 ${
                        editingLineId === line.id ? "border-[#ffba82] bg-[#fff8f0]" : "border-[#ece6df] bg-[#fffcf9]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1f1d1c]">{line.itemLabel}</p>
                          <p className="mt-1 text-sm leading-5 text-[#776d66]">{line.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditLine(line)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d7e2f5] bg-[#f1f5ff] text-[#3262c9] transition hover:bg-[#e5edff]"
                            aria-label="Edit line item"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLineItem(line.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ecd7cb] bg-[#fff7f1] text-[#c16233] transition hover:bg-[#fff0e5]"
                            aria-label="Remove line item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">UOM</p>
                          <p className="mt-1 font-semibold text-[#1f1d1c]">{line.uomBase || line.uomName || "—"}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Qty</p>
                          <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">{line.quantity}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Rate</p>
                          <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">
                            {formatCurrency(decimalAmount(line.price), draft.currency)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Amount</p>
                          <p className="mt-1 font-semibold tabular-nums text-[#ff7101]">
                            {formatCurrency(decimalAmount(line.quantity) * decimalAmount(line.price), draft.currency)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3 bg-white px-4 py-10 text-sm text-[#7d736b]">
                <PackagePlus className="h-5 w-5 text-[#ff7101]" />
                No items added yet. Use the quick add row above.
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SurfaceCard title="Notes" description="Internal or customer-facing remarks for this quotation.">
          <TextArea
            value={draft.notes}
            onChange={(value) => updateDraft({ notes: value })}
            placeholder="Add scope notes, follow-up reminders, or delivery considerations."
            rows={5}
          />
        </SurfaceCard>

        <SurfaceCard title="Terms & Summary" description="Commercial summary auto-calculated from the lines above.">
          <div className="grid gap-4">
            <TextArea
              value={draft.terms}
              onChange={(value) => updateDraft({ terms: value })}
              placeholder="Validity period, payment expectations, and approval notes."
              rows={4}
            />

            <div className="rounded-[24px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
              <div className="grid gap-3">
                <div className="flex items-center justify-between text-sm text-[#6f665f]">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#1f1d1c]">{formatCurrency(subtotal, draft.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium text-[#6f665f]">Discount</p>
                    <p className="mt-0.5 text-xs text-[#9b8f87]">Deducted from subtotal</p>
                  </div>
                  <div className="w-36 shrink-0">
                    <TextInput value={draft.discount} onChange={(value) => updateDraft({ discount: value })} placeholder="0.00" />
                  </div>
                </div>
                {taxBreakdown.length ? (
                  <div className="rounded-[18px] border border-[#e0ebfb] bg-[#f5f9ff] px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#3262c9]">Tax (customer)</span>
                      <span className="font-semibold text-[#1f1d1c]">{formatCurrency(totalTax, draft.currency)}</span>
                    </div>
                    <div className="mt-2 grid gap-1">
                      {taxBreakdown.map((tax, idx) => (
                        <div
                          key={`${tax.code}-${idx}`}
                          className="flex items-center justify-between text-xs text-[#5b6a82]"
                          title={`${tax.name} on ${formatCurrency(tax.base, draft.currency)}`}
                        >
                          <span>{formatTaxLabel({ code: tax.code, name: tax.name, rate: tax.rate, method: tax.method })}</span>
                          <span className="tabular-nums">{formatCurrency(tax.amount, draft.currency)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-[#7a8aa3]">Applied sequentially after discount.</p>
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-[20px] border border-[#ffd6b8] bg-white px-4 py-4">
                  <span className="text-base font-semibold text-[#1f1d1c]">Total</span>
                  <span className="font-sans text-2xl font-semibold tracking-[-0.03em] text-[#ff7101]">
                    {formatCurrency(grandTotal, draft.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* Quick-add customer popup — same component reused across POS,
          Invoice and Quotation. On success we auto-select the new
          customer into the draft and close the picker. */}
      <CustomerQuickCreateModal
        open={customerQuickOpen}
        onClose={() => setCustomerQuickOpen(false)}
        defaultName={customerQuickDefaultName}
        onCreated={(client) => {
          updateDraft({
            customer: {
              id: client.id,
              code: "",
              name: client.name,
              contact: client.mobile,
              city: "",
              currency: client.currency,
              taxes: [],
            },
            currency: client.currency,
          });
          setShowCustomerPicker(false);
        }}
      />
    </form>
  );
}
