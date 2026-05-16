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
import type { InvoiceProductOption } from "@/app/api/accounting/products/invoice-options/route";
import type { ClientOption } from "@/app/api/accounting/clients/options/route";
import { CustomerQuickCreateModal } from "@/components/accounting/customer-quick-create-modal";
import { InvoiceSerialPickerModal } from "@/components/accounting/invoice-serial-picker-modal";

export type InvoiceLineDraft = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemLabel: string;
  description: string;
  quantity: string;
  price: string;
  discount: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  // Set only when the line was added for a serial-tracked inventory
  // product. Forces qty=1 and references the specific serial being
  // sold. Renders as the serial number on the line + receipt.
  productSerialId?: string | null;
  productSerialNumber?: string | null;
};

export function isInvoiceQtyValid(qty: string, minQty: string): boolean {
  const q = Number(qty);
  const m = Number(minQty);
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isFinite(m) || m <= 0) return q > 0;
  const ratio = q / m;
  const rounded = Math.round(ratio);
  return rounded > 0 && Math.abs(ratio - rounded) <= 1e-6;
}

export function isInvoiceQtyWithinStock(qty: string, stockOnHand: string): boolean {
  const q = Number(qty);
  const s = Number(stockOnHand);
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isFinite(s)) return true;
  return q <= s;
}

export type InvoiceCustomerOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

export type InvoiceItemOption = InvoiceProductOption;

export type InvoiceDraft = {
  invoiceNumber: string;
  customerRef: string;
  billedBy: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  notes: string;
  terms: string;
  customer: InvoiceCustomerOption | null;
  lines: InvoiceLineDraft[];
};

type InvoiceFormPanelProps = {
  formId: string;
  draft: InvoiceDraft;
  onChange: (draft: InvoiceDraft) => void;
  onSubmit: (draft: InvoiceDraft) => void;
  // Branch the invoice is being created at. Forwarded to the
  // serial-tracked-item picker so the modal can request the
  // serials sitting at this branch. For branch-scoped users this
  // can be null — the endpoint falls back to the user's default
  // store on the server side.
  storeId?: string | null;
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
      onChange={(e) => onChange(e.target.value)}
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
      onChange={(e) => onChange(e.target.value)}
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
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        const parts = raw.split(".");
        const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
        onChange(normalized);
      }}
      placeholder={placeholder}
      className={inputShellClass}
    />
  );
}

// ─── Async paginated item select ────────────────────────────────────────────

const ITEM_PAGE_SIZE = 20;

type AsyncItemSelectProps = {
  selectedItem: InvoiceItemOption | null;
  onSelect: (item: InvoiceItemOption) => void;
};

function AsyncItemSelect({ selectedItem, onSelect }: AsyncItemSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InvoiceItemOption[]>([]);
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
      const res = await fetch(`/api/accounting/products/invoice-options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: InvoiceItemOption[]; hasMore: boolean } | null;
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

  // Close on outside click
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
          {/* Search */}
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

          {/* List */}
          <div
            ref={listRef}
            className="max-h-60 overflow-y-auto p-1.5"
            onScroll={handleScroll}
          >
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
                      {item.uomName} · {item.uomBase} · Stock: {item.stockOnHand}
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
                {query ? "No items match your search." : "No items with stock available."}
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

// ─── Async paginated customer picker ────────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

function AsyncCustomerPicker({
  selected,
  onSelect,
  onAddNew,
}: {
  selected: InvoiceCustomerOption | null;
  onSelect: (customer: InvoiceCustomerOption) => void;
  // Optional callback wired by parents that want a "+ Add" shortcut
  // next to the search bar. The current search query is passed so the
  // popup can pre-fill the name field.
  onAddNew?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<ClientOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  const fetchCustomers = useCallback(async (q: string, skip: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, skip: String(skip), take: String(CUSTOMER_PAGE_SIZE) });
      const res = await fetch(`/api/accounting/clients/options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: ClientOption[]; hasMore: boolean } | null;
      };
      if (payload.success && payload.data) {
        const fetched = payload.data.items;
        setHasMore(payload.data.hasMore);
        skipRef.current = skip + fetched.length;
        setCustomers((prev) => (append ? [...prev, ...fetched] : fetched));
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    skipRef.current = 0;
    void fetchCustomers("", 0, false);
  }, [fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      skipRef.current = 0;
      void fetchCustomers(query, 0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchCustomers]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      void fetchCustomers(query, skipRef.current, true);
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
              onChange={(e) => setQuery(e.target.value)}
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
        {customers.length ? (
          <>
            {customers.map((customer) => {
              const isSelected = selected?.id === customer.id;
              const detail =
                [customer.contact, customer.city].filter((p) => p.trim()).join(" · ") ||
                "No contact details";
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: customer.id,
                      code: "",
                      name: customer.name,
                      contact: customer.contact,
                      city: customer.city,
                      currency: customer.currency,
                    })
                  }
                  className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                    isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{customer.name}</span>
                    <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">{detail}</span>
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
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No customers found.</div>
        )}
      </div>
    </div>
  );
}

// ─── Main form component ─────────────────────────────────────────────────────

export function InvoiceFormPanel({
  formId,
  draft,
  onChange,
  onSubmit,
  storeId,
}: InvoiceFormPanelProps) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerQuickOpen, setCustomerQuickOpen] = useState(false);
  const [customerQuickDefaultName, setCustomerQuickDefaultName] = useState("");
  const [serialPickerOpen, setSerialPickerOpen] = useState(false);

  // Selected item — full object, not just ID
  const [selectedItem, setSelectedItem] = useState<InvoiceItemOption | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [linePrice, setLinePrice] = useState("0.00");
  const [lineDiscount, setLineDiscount] = useState("0.00");
  const [lineDescription, setLineDescription] = useState("");
  const [lineUomName, setLineUomName] = useState("");
  const [lineUomBase, setLineUomBase] = useState("");
  const [lineUomMinQty, setLineUomMinQty] = useState("1");
  const [lineStockOnHand, setLineStockOnHand] = useState("0");
  const [lineQtyError, setLineQtyError] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const subtotal = useMemo(
    () => draft.lines.reduce((sum, line) => sum + decimalAmount(line.quantity) * decimalAmount(line.price), 0),
    [draft.lines]
  );
  const discountAmount = useMemo(
    () => draft.lines.reduce((sum, line) => sum + decimalAmount(line.discount), 0),
    [draft.lines]
  );
  const grandTotal = Math.max(0, subtotal - discountAmount);

  function updateDraft(patch: Partial<InvoiceDraft>) {
    onChange({ ...draft, ...patch });
  }

  function handleItemSelect(item: InvoiceItemOption) {
    setSelectedItem(item);
    setLinePrice(item.price);
    setLineDescription(item.name);
    setLineUomName(item.uomName);
    setLineUomBase(item.uomBase);
    setLineUomMinQty(item.uomMinQty);
    setLineStockOnHand(item.stockOnHand);
    setLineQtyError(null);
    // Serial-tracked items always sell qty=1 per serial — pin the
    // qty input to 1 so the cashier can't accidentally type more.
    if (item.serialTrackingEnabled) {
      setLineQty("1");
      // Hint via the qty-error slot (which is positioned right
      // under the qty input) that they must pick a serial. The Add
      // button is also disabled in that case, see below.
      setLineQtyError("Click Add to pick a serial number for this item.");
    }
  }

  function addLineItem() {
    if (!selectedItem) return;
    // Serial-tracked items branch into the picker flow — pick the
    // serial, then the picker's onPick callback finishes the add.
    if (selectedItem.serialTrackingEnabled) {
      setSerialPickerOpen(true);
      return;
    }
    const qty = lineQty || lineUomMinQty || "1";
    if (!isInvoiceQtyValid(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
    if (!isInvoiceQtyWithinStock(qty, lineStockOnHand)) {
      setLineQtyError(`Only ${lineStockOnHand} ${selectedItem.uomName} in stock.`);
      return;
    }
    setLineQtyError(null);
    const nextLine: InvoiceLineDraft = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemCode: selectedItem.code,
      itemName: selectedItem.name,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription || selectedItem.name,
      quantity: qty,
      price: linePrice || selectedItem.price,
      discount: lineDiscount || "0.00",
      uomName: lineUomName,
      uomBase: lineUomBase,
      uomMinQty: lineUomMinQty || "1",
    };
    updateDraft({ lines: [...draft.lines, nextLine] });
    // Reset qty + discount after add, keep item selected for quick multi-add
    setLineQty(selectedItem.uomMinQty || "1");
    setLineDiscount("0.00");
  }

  // Called from the InvoiceSerialPickerModal when the cashier picks a
  // serial for a serial-tracked product. Builds a qty=1 line with the
  // picked serial attached and clears the input row for the next add.
  function addSerialLine(serial: { serialId: string; serialNumber: string }) {
    if (!selectedItem) return;
    const nextLine: InvoiceLineDraft = {
      id: `${selectedItem.id}-${serial.serialId}-${Date.now()}`,
      itemId: selectedItem.id,
      itemCode: selectedItem.code,
      itemName: selectedItem.name,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription || selectedItem.name,
      quantity: "1",
      price: linePrice || selectedItem.price,
      discount: lineDiscount || "0.00",
      uomName: lineUomName,
      uomBase: lineUomBase,
      uomMinQty: "1",
      productSerialId: serial.serialId,
      productSerialNumber: serial.serialNumber,
    };
    updateDraft({ lines: [...draft.lines, nextLine] });
    setSerialPickerOpen(false);
    // Clear the input row entirely so the cashier picks a fresh
    // product (or the same product, but a different serial).
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDiscount("0.00");
    setLineDescription("");
    setLineUomName("");
    setLineUomBase("");
    setLineUomMinQty("1");
    setLineStockOnHand("0");
    setLineQtyError(null);
  }

  function removeLineItem(lineId: string) {
    updateDraft({ lines: draft.lines.filter((l) => l.id !== lineId) });
    if (editingLineId === lineId) cancelEdit();
  }

  function startEditLine(line: InvoiceLineDraft) {
    // Reconstruct a minimal InvoiceItemOption from the line snapshot for the async select to show
    const itemSnapshot: InvoiceItemOption = {
      id: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      description: "",
      price: line.price,
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomCode: "",
      uomMinQty: line.uomMinQty,
      stockOnHand: "0",
      // Existing lines can't be serial-tracked (the guard above
      // prevents them from being added in the first place), so a
      // safe `false` keeps the snapshot type-compatible.
      serialTrackingEnabled: false,
    };
    setSelectedItem(itemSnapshot);
    setLineQty(line.quantity);
    setLinePrice(line.price);
    setLineDiscount(line.discount || "0.00");
    setLineDescription(line.description);
    setLineUomName(line.uomName);
    setLineUomBase(line.uomBase);
    setLineUomMinQty(line.uomMinQty);
    setLineStockOnHand("0");
    setEditingLineId(line.id);
  }

  function cancelEdit() {
    setEditingLineId(null);
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDiscount("0.00");
    setLineDescription("");
    setLineUomName("");
    setLineUomBase("");
    setLineUomMinQty("1");
    setLineStockOnHand("0");
  }

  function updateLineItem() {
    if (!editingLineId || !selectedItem) return;
    const qty = lineQty || lineUomMinQty || "1";
    if (!isInvoiceQtyValid(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
    if (Number(lineStockOnHand) > 0 && !isInvoiceQtyWithinStock(qty, lineStockOnHand)) {
      setLineQtyError(`Only ${lineStockOnHand} ${selectedItem.uomName} in stock.`);
      return;
    }
    setLineQtyError(null);
    updateDraft({
      lines: draft.lines.map((l) =>
        l.id === editingLineId
          ? {
              ...l,
              itemId: selectedItem.id,
              itemCode: selectedItem.code,
              itemName: selectedItem.name,
              itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
              description: lineDescription,
              quantity: qty,
              price: linePrice || selectedItem.price,
              discount: lineDiscount || "0.00",
              uomName: lineUomName,
              uomBase: lineUomBase,
              uomMinQty: lineUomMinQty || "1",
            }
          : l
      ),
    });
    setEditingLineId(null);
    setSelectedItem(null);
    setLineQty("1");
    setLinePrice("0.00");
    setLineDiscount("0.00");
    setLineDescription("");
  }

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      {/* Header card: customer + meta fields */}
      <SurfaceCard overflow="visible">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          {/* Customer picker */}
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
                      Choose a customer from the register to prepare this invoice.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerPicker((c) => !c)}
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
                      <div key={label} className="rounded-[18px] border border-[#ece2d8] bg-white/70 px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">{label}</p>
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
                    setShowCustomerPicker(false);
                  }}
                  onAddNew={(currentQuery) => {
                    setCustomerQuickDefaultName(currentQuery);
                    setCustomerQuickOpen(true);
                  }}
                />
              ) : null}
            </div>
          </div>

          {/* Meta fields */}
          <div className="grid gap-4 rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel label="Invoice Number" />
                <div className="min-h-12 w-full rounded-2xl border border-[#dfd4ca] bg-[#f7f1ea] px-4 py-3 text-sm text-[#5f5750]">
                  {draft.invoiceNumber || "Auto-assigned on save · configured in Settings → Form IDs"}
                </div>
              </div>
              <div>
                <FieldLabel label="Customer Ref" />
                <TextInput value={draft.customerRef} onChange={(v) => updateDraft({ customerRef: v })} placeholder="Customer reference / PO number" />
              </div>
              <div>
                <FieldLabel label="Invoice Date" />
                <DateInput value={draft.invoiceDate} onChange={(v) => updateDraft({ invoiceDate: v })} />
              </div>
              <div>
                <FieldLabel label="Due Date" />
                <DateInput value={draft.dueDate} onChange={(v) => updateDraft({ dueDate: v })} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel label="Billed By" />
                <TextInput value={draft.billedBy} onChange={(v) => updateDraft({ billedBy: v })} placeholder="Sales rep / account manager" />
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
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Due</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.dueDate || "Not set"}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <CalendarDays className="h-4 w-4 text-[#18a66a]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Date</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.invoiceDate || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* Line items */}
      <SurfaceCard
        title="Invoice Items"
        description="Add products from the inventory register, then set quantity and rate. These lines will appear on the printed invoice."
        overflow="visible"
      >
        <div className="grid gap-4">
          <div
            className={`grid gap-3 rounded-[24px] border p-4 xl:grid-cols-[1.2fr_1fr_0.45fr_0.6fr_0.6fr_0.7fr_auto] ${
              editingLineId ? "border-[#ffba82] bg-[#fff8f0]" : "border-[#e9dfd5] bg-[#fffaf5]"
            }`}
          >
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
              </div>
              <NumericInput
                value={lineQty}
                onChange={(v) => { setLineQty(v); setLineQtyError(null); }}
                placeholder="1"
              />
              {selectedItem ? (
                <p className="mt-1.5 text-xs text-[#8c7f74]">
                  Min: {selectedItem.uomMinQty} {selectedItem.uomName} · Stock: {lineStockOnHand} {selectedItem.uomBase}
                </p>
              ) : null}
              {lineQtyError ? (
                <p className="mt-1.5 text-xs font-semibold text-red-600">{lineQtyError}</p>
              ) : null}
            </div>
            <div>
              <FieldLabel label="Rate" />
              <NumericInput value={linePrice} onChange={setLinePrice} placeholder="0.00" />
            </div>
            <div>
              <FieldLabel label="Discount" />
              <NumericInput value={lineDiscount} onChange={setLineDiscount} placeholder="0.00" />
            </div>
            <div>
              <FieldLabel label="Line total" />
              <div className="flex h-12 items-center justify-end rounded-2xl border border-[#e9dfd5] bg-white px-3 text-right text-sm font-semibold tabular-nums text-[#1f1d1c]">
                {formatCurrency(
                  Math.max(
                    0,
                    decimalAmount(lineQty || "0") * decimalAmount(linePrice || "0") -
                      decimalAmount(lineDiscount || "0"),
                  ),
                  draft.currency || "LKR",
                )}
              </div>
            </div>
            <div className="flex items-end gap-2 pt-0.5">
              {editingLineId ? (
                <>
                  <button
                    type="button"
                    onClick={updateLineItem}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff7101] text-white transition hover:bg-[#e86500]"
                    aria-label="Save edit"
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#dfd4ca] bg-white text-[#7c7067] transition hover:bg-[#f5ede5]"
                    aria-label="Cancel edit"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={addLineItem}
                  disabled={!selectedItem}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#ff7101] px-4 text-sm font-semibold text-white transition hover:bg-[#e86500] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>
              )}
            </div>
          </div>

          {draft.lines.length > 0 ? (
            <div className="overflow-hidden rounded-[20px] border border-[#eadfd5]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#eadfd5] bg-[#fffaf5]">
                    {["#", "Product", "Description", "UOM", "Qty", "Rate", "Discount", "Total", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, idx) => (
                    <tr
                      key={line.id}
                      className={`border-b border-[#f0e8e0] last:border-0 ${
                        editingLineId === line.id ? "bg-[#fff8f0]" : "hover:bg-[#fffaf7]"
                      }`}
                    >
                      <td className="px-4 py-3 text-[#9b7a61]">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#1f1d1c]">{line.itemName}</p>
                        <p className="text-xs text-[#9b7a61]">{line.itemCode}</p>
                        {line.productSerialNumber ? (
                          <p className="mt-0.5 font-mono text-[11px] font-semibold text-[#ff7101]">
                            Serial: {line.productSerialNumber}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-[#5c534d]">{line.description || "—"}</td>
                      <td className="px-4 py-3 text-[#5c534d]">{line.uomName}</td>
                      <td className="px-4 py-3 text-[#1f1d1c]">{line.quantity}</td>
                      <td className="px-4 py-3 text-[#1f1d1c]">
                        {formatCurrency(decimalAmount(line.price), draft.currency || "LKR")}
                      </td>
                      <td className="px-4 py-3 text-[#1f1d1c]">
                        {formatCurrency(decimalAmount(line.discount), draft.currency || "LKR")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#1f1d1c]">
                        {formatCurrency(
                          decimalAmount(line.quantity) * decimalAmount(line.price) -
                            decimalAmount(line.discount),
                          draft.currency || "LKR"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditLine(line)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#eadfd5] bg-white text-[#7c7067] transition hover:bg-[#fff5ec] hover:text-[#ff7101]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLineItem(line.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#f0c8c8] bg-white text-[#c94040] transition hover:bg-[#fff0f0]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 rounded-[20px] border border-dashed border-[#e0d5cc] bg-[#fffaf5] py-10 text-sm text-[#9b7a61]">
              <PackagePlus className="h-5 w-5" />
              No items added yet. Use the quick add row above.
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Notes + Terms */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-[#1f1d1c]">Notes</h2>
            <p className="mt-1 text-sm text-[#7f746d]">Internal or customer-facing remarks for this invoice.</p>
          </div>
          <TextArea
            value={draft.notes}
            onChange={(v) => updateDraft({ notes: v })}
            placeholder="Add delivery instructions, special conditions, or internal notes."
          />
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-[#1f1d1c]">Terms & Summary</h2>
            <p className="mt-1 text-sm text-[#7f746d]">Commercial summary auto-calculated from the lines above.</p>
          </div>
          <div className="grid gap-4">
            <TextArea
              value={draft.terms}
              onChange={(v) => updateDraft({ terms: v })}
              placeholder="Payment terms, late payment policy, and delivery conditions."
              rows={3}
            />
            <div className="grid gap-2 rounded-[20px] border border-[#eadfd5] bg-[#fffaf5] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#7f746d]">Subtotal</span>
                <span className="font-semibold text-[#1f1d1c]">
                  {formatCurrency(subtotal, draft.currency || "LKR")}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex flex-col">
                  <span className="text-[#7f746d]">Discount</span>
                  <span className="text-[11px] text-[#9b7a61]">Sum of line discounts</span>
                </span>
                <span className="font-semibold text-[#1f1d1c]">
                  {formatCurrency(discountAmount, draft.currency || "LKR")}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-[#eadfd5] pt-3 text-sm">
                <span className="font-semibold text-[#1f1d1c]">Total</span>
                <span className="text-base font-bold text-[#ff7101]">
                  {formatCurrency(grandTotal, draft.currency || "LKR")}
                </span>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* Quick-add customer popup — opened from the customer picker
          "+ Add" button. On success the new customer is auto-selected
          into the draft and the picker closes. */}
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
            },
            currency: client.currency,
          });
          setShowCustomerPicker(false);
        }}
      />

      {/* Serial picker — opened when the user clicks Add Item for a
          serial-tracked product. Lists active serials at the branch
          minus anything already locked by another bill/invoice. */}
      <InvoiceSerialPickerModal
        open={serialPickerOpen}
        onClose={() => setSerialPickerOpen(false)}
        productId={selectedItem?.id ?? null}
        productName={selectedItem?.name ?? ""}
        storeId={storeId ?? null}
        onPick={(serial) => addSerialLine(serial)}
      />
    </form>
  );
}
