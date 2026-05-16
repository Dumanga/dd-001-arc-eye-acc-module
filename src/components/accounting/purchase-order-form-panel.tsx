"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Truck,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";
import type { PoProductOption } from "@/app/api/accounting/products/po-options/route";
import type { PoSupplierOption } from "@/app/api/accounting/suppliers/po-options/route";
import { SupplierQuickCreateModal } from "@/components/accounting/supplier-quick-create-modal";

export type PurchaseOrderTax = {
  code: string;
  name: string;
  rate: string;
  method: "PERCENTAGE" | "FIXED_AMOUNT";
};

export type PurchaseOrderLineDraft = {
  id: string;
  itemId: string;
  itemLabel: string;
  description: string;
  quantity: string;
  price: string;
  uomName: string;
  uomBase: string;
};

export type PurchaseOrderSupplierOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
  taxes: PurchaseOrderTax[];
};

export type PurchaseOrderItemOption = PoProductOption;

export type PurchaseOrderDraft = {
  poNumber: string;
  supplierRef: string;
  buyerCode: string;
  poDate: string;
  expectedDate: string;
  currency: string;
  discount: string;
  notes: string;
  terms: string;
  supplier: PurchaseOrderSupplierOption | null;
  lines: PurchaseOrderLineDraft[];
};

type PurchaseOrderFormPanelProps = {
  formId: string;
  draft: PurchaseOrderDraft;
  onChange: (draft: PurchaseOrderDraft) => void;
  onSubmit: (draft: PurchaseOrderDraft) => void;
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

function formatTaxLabel(tax: PurchaseOrderTax) {
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

const PAGE = 20;

function AsyncItemSelect({
  selected,
  onSelect,
}: {
  selected: PurchaseOrderItemOption | null;
  onSelect: (item: PurchaseOrderItemOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PurchaseOrderItemOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  async function fetchItems(search: string, skip: number, replace: boolean) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, skip: String(skip), take: String(PAGE) });
      const res = await fetch(`/api/accounting/products/po-options?${params}`);
      const json = await res.json();
      if (json.success) {
        const newItems: PurchaseOrderItemOption[] = json.data.items;
        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setHasMore(json.data.hasMore);
        skipRef.current = skip + newItems.length;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    skipRef.current = 0;
    fetchItems(query, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      skipRef.current = 0;
      fetchItems(query, 0, true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      fetchItems(query, skipRef.current, false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className={`${inputShellClass} flex items-center justify-between gap-3`}
      >
        <span className={`truncate ${selected ? "text-[#1f1d1c]" : "text-[#a1968c]"}`}>
          {selected ? `${selected.code} – ${selected.name}` : "Select item"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[22px] border border-[#eadfd5] bg-white shadow-[0_22px_54px_rgba(42,34,28,0.15)]">
          <div className="border-b border-[#f0e5dc] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search items"
                autoFocus
                className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2" onScroll={handleScroll}>
            {items.length ? (
              <>
                {items.map((item) => {
                  const isSelected = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-[#fff1e2] text-[#a95915]"
                          : "text-[#4f4741] hover:bg-[#fff8f0]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {item.code} – {item.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#85786d]">
                          {item.uomName} · {item.uomBase}
                        </span>
                      </span>
                      {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
                {loading ? (
                  <div className="py-2 text-center text-xs text-[#9b8f87]">Loading more…</div>
                ) : null}
              </>
            ) : loading ? (
              <div className="px-3 py-8 text-center text-sm text-[#7f746d]">Loading…</div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No items found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AsyncSupplierPicker({
  selected,
  onSelect,
  onAddNew,
}: {
  selected: PurchaseOrderSupplierOption | null;
  onSelect: (supplier: PurchaseOrderSupplierOption) => void;
  // Optional callback used by the parent to open a quick-add modal.
  onAddNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<PoSupplierOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  async function fetchSuppliers(search: string, skip: number, replace: boolean) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, skip: String(skip), take: String(PAGE) });
      const res = await fetch(`/api/accounting/suppliers/po-options?${params}`);
      const json = await res.json();
      if (json.success) {
        const newItems: PoSupplierOption[] = json.data.items;
        setSuppliers((prev) => (replace ? newItems : [...prev, ...newItems]));
        setHasMore(json.data.hasMore);
        skipRef.current = skip + newItems.length;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    skipRef.current = 0;
    fetchSuppliers("", 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      skipRef.current = 0;
      fetchSuppliers(query, 0, true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      fetchSuppliers(query, skipRef.current, false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
      <div className="border-b border-[#f0e5dc] p-3">
        <div className="flex items-center gap-2">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search suppliers"
              className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
          {onAddNew ? (
            <button
              type="button"
              onClick={onAddNew}
              title="Add new supplier"
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#ff7101] px-3.5 text-xs font-semibold text-white transition hover:bg-[#ea6a08]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto p-2" onScroll={handleScroll}>
        {suppliers.length ? (
          <>
            {suppliers.map((supplier) => {
              const isSelected = selected?.id === supplier.id;
              return (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => onSelect(supplier as PurchaseOrderSupplierOption)}
                  className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                    isSelected
                      ? "bg-[#fff1e2] text-[#a95915]"
                      : "text-[#5c534d] hover:bg-[#fff8f0]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{supplier.name}</span>
                    <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">
                      {supplier.code} · {supplier.contact} · {supplier.city}
                    </span>
                  </span>
                  {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
            {loading ? (
              <div className="py-2 text-center text-xs text-[#9b8f87]">Loading more…</div>
            ) : null}
          </>
        ) : loading ? (
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">Loading…</div>
        ) : (
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No suppliers found.</div>
        )}
      </div>
    </div>
  );
}

export function PurchaseOrderFormPanel({
  formId,
  draft,
  onChange,
  onSubmit,
}: PurchaseOrderFormPanelProps) {
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [supplierQuickOpen, setSupplierQuickOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PurchaseOrderItemOption | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [linePrice, setLinePrice] = useState("0.00");
  const [lineDescription, setLineDescription] = useState("");
  const [uomInfoOpen, setUomInfoOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const subtotal = useMemo(
    () =>
      draft.lines.reduce(
        (sum, line) => sum + decimalAmount(line.quantity) * decimalAmount(line.price),
        0
      ),
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
    const supplierTaxes = draft.supplier?.taxes ?? [];
    let runningBase = afterDiscount;
    for (const tax of supplierTaxes) {
      const rateNum = decimalAmount(tax.rate);
      const amount =
        tax.method === "PERCENTAGE" ? (runningBase * rateNum) / 100 : rateNum;
      breakdown.push({
        code: tax.code,
        name: tax.name,
        rate: tax.rate,
        method: tax.method,
        amount,
        base: runningBase,
      });
      runningBase += amount;
    }
    return breakdown;
  }, [draft.supplier?.taxes, afterDiscount]);
  const totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
  const grandTotal = afterDiscount + totalTax;

  function updateDraft(patch: Partial<PurchaseOrderDraft>) {
    onChange({ ...draft, ...patch });
  }

  function addLineItem() {
    if (!selectedItem) return;

    const nextLine: PurchaseOrderLineDraft = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription || selectedItem.name,
      quantity: lineQty || "1",
      price: linePrice || selectedItem.price,
      uomName: selectedItem.uomName,
      uomBase: selectedItem.uomBase,
    };

    updateDraft({ lines: [...draft.lines, nextLine] });
    setLineQty("1");
    setLinePrice(selectedItem.price);
    setLineDescription(selectedItem.name);
  }

  function removeLineItem(lineId: string) {
    updateDraft({ lines: draft.lines.filter((line) => line.id !== lineId) });
    if (editingLineId === lineId) cancelEdit();
  }

  function startEditLine(line: PurchaseOrderLineDraft) {
    const parts = line.itemLabel.split(" · ");
    setSelectedItem({
      id: line.itemId,
      code: parts[0] ?? "",
      name: parts.slice(1).join(" · ") || line.description,
      description: "",
      price: line.price,
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomCode: "",
      uomMinQty: "1",
      serialTrackingEnabled: false,
    });
    setLineQty(line.quantity);
    setLinePrice(line.price);
    setLineDescription(line.description);
    setEditingLineId(line.id);
    setUomInfoOpen(false);
  }

  function cancelEdit() {
    setEditingLineId(null);
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDescription("");
    setUomInfoOpen(false);
  }

  function updateLineItem() {
    if (!editingLineId || !selectedItem) return;
    updateDraft({
      lines: draft.lines.map((line) =>
        line.id === editingLineId
          ? {
              ...line,
              itemId: selectedItem.id,
              itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
              description: lineDescription,
              quantity: lineQty || "1",
              price: linePrice || selectedItem.price,
              uomName: selectedItem.uomName,
              uomBase: selectedItem.uomBase,
            }
          : line
      ),
    });
    setEditingLineId(null);
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDescription("");
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">Supplier</p>
                  <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                    {draft.supplier ? draft.supplier.name : "Add Supplier"}
                  </h3>
                  {!draft.supplier ? (
                    <p className="mt-1 text-sm text-[#7f746d]">
                      Choose a supplier from the register to start this purchase order.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSupplierPicker((current) => !current)}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffcfaa] bg-white text-[#ff7101] transition hover:bg-[#fff5ec]"
                  aria-label="Select supplier"
                >
                  <UserPlus className="h-5 w-5" />
                </button>
              </div>

              {draft.supplier && !showSupplierPicker ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "Code", value: draft.supplier.code },
                    { label: "Contact", value: draft.supplier.contact },
                    { label: "City", value: draft.supplier.city },
                    { label: "Currency", value: draft.currency || "LKR" },
                  ].map(({ label, value }) => (
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

              {showSupplierPicker ? (
                <AsyncSupplierPicker
                  selected={draft.supplier}
                  onSelect={(supplier) => {
                    updateDraft({ supplier, currency: supplier.currency });
                    setShowSupplierPicker(false);
                  }}
                  onAddNew={() => setSupplierQuickOpen(true)}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel label="PO Number" />
                <div className="min-h-12 w-full rounded-2xl border border-[#dfd4ca] bg-[#f7f1ea] px-4 py-3 text-sm text-[#5f5750]">
                  {draft.poNumber || "Auto-assigned on save · configured in Settings → Form IDs"}
                </div>
              </div>
              <div>
                <FieldLabel label="Supplier Ref" />
                <TextInput
                  value={draft.supplierRef}
                  onChange={(value) => updateDraft({ supplierRef: value })}
                  placeholder="Vendor reference"
                />
              </div>
              <div>
                <FieldLabel label="PO Date" />
                <DateInput value={draft.poDate} onChange={(value) => updateDraft({ poDate: value })} />
              </div>
              <div>
                <FieldLabel label="Expected On" />
                <DateInput
                  value={draft.expectedDate}
                  onChange={(value) => updateDraft({ expectedDate: value })}
                />
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
                  <Truck className="h-4 w-4 text-[#2d6df6]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">ETA</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">
                  {draft.expectedDate || "Not set"}
                </p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <CalendarDays className="h-4 w-4 text-[#18a66a]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Today</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.poDate || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="PO Items"
        description="Add products from inventory, then adjust quantity and rate before finalizing the order."
        overflow="visible"
      >
        <div className="grid gap-4">
          <div
            className={`grid gap-3 rounded-[24px] border p-4 xl:grid-cols-[1.3fr_1fr_0.45fr_0.65fr_auto] ${
              editingLineId
                ? "border-[#ffba82] bg-[#fff8f0]"
                : "border-[#e9dfd5] bg-[#fffaf5]"
            }`}
          >
            <div>
              <FieldLabel label="Item" />
              <AsyncItemSelect
                selected={selectedItem}
                onSelect={(item) => {
                  setSelectedItem(item);
                  setLinePrice(item.price);
                  setLineDescription(item.name);
                  setUomInfoOpen(false);
                }}
              />
            </div>
            <div>
              <FieldLabel label="Description" />
              <TextInput
                value={lineDescription}
                onChange={setLineDescription}
                placeholder="Item description"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[#4b433d]">Qty</span>
                {selectedItem?.uomName ? (
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
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">
                          Unit of Measure
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-[#1f1d1c]">
                          {selectedItem.uomName}
                        </p>
                        <p className="mt-1 text-xs text-[#7a6f67]">
                          Base unit:{" "}
                          <span className="font-semibold text-[#1f1d1c]">{selectedItem.uomBase}</span>
                        </p>
                        <p className="mt-1 text-xs text-[#7a6f67]">
                          Min qty:{" "}
                          <span className="font-semibold text-[#1f1d1c]">{selectedItem.uomMinQty}</span>
                        </p>
                        <p className="mt-2 text-xs leading-4 text-[#8c7f74]">
                          Enter quantity in{" "}
                          <span className="font-semibold">{selectedItem.uomBase}</span>.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <NumericInput value={lineQty} onChange={setLineQty} placeholder="1" />
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
                          <td className="px-4 py-4 text-right align-middle tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="px-4 py-4 text-right align-middle tabular-nums">
                            {formatCurrency(decimalAmount(line.price), draft.currency)}
                          </td>
                          <td className="px-4 py-4 text-right align-middle font-semibold tabular-nums">
                            {formatCurrency(
                              decimalAmount(line.quantity) * decimalAmount(line.price),
                              draft.currency
                            )}
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
                        editingLineId === line.id
                          ? "border-[#ffba82] bg-[#fff8f0]"
                          : "border-[#ece6df] bg-[#fffcf9]"
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
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                            UOM
                          </p>
                          <p className="mt-1 font-semibold text-[#1f1d1c]">
                            {line.uomBase || line.uomName || "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                            Qty
                          </p>
                          <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">
                            {line.quantity}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                            Rate
                          </p>
                          <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">
                            {formatCurrency(decimalAmount(line.price), draft.currency)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                            Amount
                          </p>
                          <p className="mt-1 font-semibold tabular-nums text-[#ff7101]">
                            {formatCurrency(
                              decimalAmount(line.quantity) * decimalAmount(line.price),
                              draft.currency
                            )}
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
        <SurfaceCard title="Notes" description="Internal or supplier-facing purchase notes for this draft PO.">
          <TextArea
            value={draft.notes}
            onChange={(value) => updateDraft({ notes: value })}
            placeholder="Add delivery instructions, packing notes, or expected receiving remarks."
            rows={5}
          />
        </SurfaceCard>

        <SurfaceCard
          title="Terms & Summary"
          description="Commercial summary — finalized when the PO is confirmed."
        >
          <div className="grid gap-4">
            <TextArea
              value={draft.terms}
              onChange={(value) => updateDraft({ terms: value })}
              placeholder="Payment terms, delivery expectations, and approval notes."
              rows={4}
            />

            <div className="rounded-[24px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
              <div className="grid gap-3">
                <div className="flex items-center justify-between text-sm text-[#6f665f]">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#1f1d1c]">
                    {formatCurrency(subtotal, draft.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium text-[#6f665f]">Discount</p>
                    <p className="mt-0.5 text-xs text-[#9b8f87]">Deducted from subtotal</p>
                  </div>
                  <div className="w-36 shrink-0">
                    <TextInput
                      value={draft.discount}
                      onChange={(value) => updateDraft({ discount: value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {taxBreakdown.length ? (
                  <div className="rounded-[18px] border border-[#e0ebfb] bg-[#f5f9ff] px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#3262c9]">Tax (supplier)</span>
                      <span className="font-semibold text-[#1f1d1c]">
                        {formatCurrency(totalTax, draft.currency)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1">
                      {taxBreakdown.map((tax, idx) => (
                        <div
                          key={`${tax.code}-${idx}`}
                          className="flex items-center justify-between text-xs text-[#5b6a82]"
                          title={`${tax.name} on ${formatCurrency(tax.base, draft.currency)}`}
                        >
                          <span>
                            {formatTaxLabel({
                              code: tax.code,
                              name: tax.name,
                              rate: tax.rate,
                              method: tax.method,
                            })}
                          </span>
                          <span className="tabular-nums">
                            {formatCurrency(tax.amount, draft.currency)}
                          </span>
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

      {/* Quick-add supplier popup. After save the new supplier is
          mapped to PurchaseOrderSupplierOption and selected on the
          draft, matching the regular picker's onSelect flow. */}
      <SupplierQuickCreateModal
        open={supplierQuickOpen}
        onClose={() => setSupplierQuickOpen(false)}
        onCreated={(supplier) => {
          updateDraft({
            supplier: {
              id: supplier.id,
              code: supplier.supplierCode,
              name: supplier.supplierName,
              contact: "",
              city: "",
              currency: draft.currency || "LKR",
              taxes: [],
            },
          });
          setShowSupplierPicker(false);
        }}
      />
    </form>
  );
}
