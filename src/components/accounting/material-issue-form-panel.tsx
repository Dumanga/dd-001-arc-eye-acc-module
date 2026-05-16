"use client";

import {
  Check,
  ChevronDown,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";
import { CategorizedAccountPicker } from "@/components/accounting/categorized-account-picker";
import type { IssueProductOption } from "@/app/api/accounting/products/issue-options/route";

// ─── Types ────────────────────────────────────────────────────────────────

// Backed by /api/accounting/products/issue-options — includes BUY, SELL,
// and BOTH trade-mode inventory items (so internal-consumption picks like
// cleaning supplies or repair-only consumables are visible). Excludes
// services and vouchers.
export type MaterialIssueItemOption = IssueProductOption;

export type MaterialIssueLineDraft = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemLabel: string;
  description: string;
  quantity: string;
  unitCost: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  notes: string;
};

export type MaterialIssueExpenseAccount = {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
};

export type MaterialIssueDraft = {
  issueNumber: string;
  issueDate: string;
  expenseAccount: MaterialIssueExpenseAccount | null;
  requestedBy: string;
  purpose: string;
  notes: string;
  currency: string;
  lines: MaterialIssueLineDraft[];
};

type MaterialIssueFormPanelProps = {
  formId: string;
  draft: MaterialIssueDraft;
  onChange: (draft: MaterialIssueDraft) => void;
  onSubmit: (draft: MaterialIssueDraft) => void | Promise<void>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function decimalAmount(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isQtyValidAgainstUom(qty: string, minQty: string): boolean {
  const q = Number(qty);
  const m = Number(minQty);
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isFinite(m) || m <= 0) return q > 0;
  const ratio = q / m;
  const rounded = Math.round(ratio);
  return rounded > 0 && Math.abs(ratio - rounded) <= 1e-6;
}

function isQtyWithinStock(qty: string, stockOnHand: string): boolean {
  const q = Number(qty);
  const s = Number(stockOnHand);
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isFinite(s)) return true;
  return q <= s;
}

// ─── Main panel ───────────────────────────────────────────────────────────

export function MaterialIssueFormPanel({
  formId,
  draft,
  onChange,
  onSubmit,
}: MaterialIssueFormPanelProps) {
  const [selectedItem, setSelectedItem] = useState<MaterialIssueItemOption | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [lineUnitCost, setLineUnitCost] = useState("0.00");
  const [lineDescription, setLineDescription] = useState("");
  const [lineUomName, setLineUomName] = useState("");
  const [lineUomBase, setLineUomBase] = useState("");
  const [lineUomMinQty, setLineUomMinQty] = useState("1");
  const [lineStockOnHand, setLineStockOnHand] = useState("0");
  const [lineNotes, setLineNotes] = useState("");
  const [lineQtyError, setLineQtyError] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const totalQty = useMemo(
    () => draft.lines.reduce((sum, l) => sum + decimalAmount(l.quantity), 0),
    [draft.lines],
  );
  const totalValue = useMemo(
    () =>
      draft.lines.reduce(
        (sum, l) => sum + decimalAmount(l.quantity) * decimalAmount(l.unitCost),
        0,
      ),
    [draft.lines],
  );

  function updateDraft(patch: Partial<MaterialIssueDraft>) {
    onChange({ ...draft, ...patch });
  }

  function handleItemSelect(item: MaterialIssueItemOption) {
    setSelectedItem(item);
    setLineUnitCost(item.price);
    setLineDescription(item.name);
    setLineUomName(item.uomName);
    setLineUomBase(item.uomBase);
    setLineUomMinQty(item.uomMinQty);
    setLineStockOnHand(item.stockOnHand);
    setLineQtyError(null);
  }

  function resetEntryRow() {
    setSelectedItem(null);
    setLineQty("1");
    setLineUnitCost("0.00");
    setLineDescription("");
    setLineUomName("");
    setLineUomBase("");
    setLineUomMinQty("1");
    setLineStockOnHand("0");
    setLineNotes("");
    setLineQtyError(null);
  }

  function addLineItem() {
    if (!selectedItem) return;
    const qty = lineQty || lineUomMinQty || "1";
    if (!isQtyValidAgainstUom(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
    if (!isQtyWithinStock(qty, lineStockOnHand)) {
      setLineQtyError(`Only ${lineStockOnHand} ${selectedItem.uomName} in stock.`);
      return;
    }
    const nextLine: MaterialIssueLineDraft = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemCode: selectedItem.code,
      itemName: selectedItem.name,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription || selectedItem.name,
      quantity: qty,
      unitCost: lineUnitCost || selectedItem.price,
      uomName: lineUomName,
      uomBase: lineUomBase,
      uomMinQty: lineUomMinQty || "1",
      notes: lineNotes,
    };
    updateDraft({ lines: [...draft.lines, nextLine] });
    resetEntryRow();
  }

  function removeLineItem(lineId: string) {
    updateDraft({ lines: draft.lines.filter((l) => l.id !== lineId) });
    if (editingLineId === lineId) cancelEdit();
  }

  function startEditLine(line: MaterialIssueLineDraft) {
    const itemSnapshot: MaterialIssueItemOption = {
      id: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      description: "",
      price: line.unitCost,
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomCode: "",
      uomMinQty: line.uomMinQty,
      stockOnHand: "0",
    };
    setSelectedItem(itemSnapshot);
    setLineQty(line.quantity);
    setLineUnitCost(line.unitCost);
    setLineDescription(line.description);
    setLineUomName(line.uomName);
    setLineUomBase(line.uomBase);
    setLineUomMinQty(line.uomMinQty);
    setLineStockOnHand("0");
    setLineNotes(line.notes);
    setEditingLineId(line.id);
  }

  function cancelEdit() {
    setEditingLineId(null);
    resetEntryRow();
  }

  function updateLineItem() {
    if (!editingLineId || !selectedItem) return;
    const qty = lineQty || lineUomMinQty || "1";
    if (!isQtyValidAgainstUom(qty, lineUomMinQty)) {
      setLineQtyError(`Quantity must be a positive multiple of ${lineUomMinQty || "1"} (UOM minimum).`);
      return;
    }
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
              unitCost: lineUnitCost || selectedItem.price,
              uomName: lineUomName,
              uomBase: lineUomBase,
              uomMinQty: lineUomMinQty || "1",
              notes: lineNotes,
            }
          : l,
      ),
    });
    setEditingLineId(null);
    resetEntryRow();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(draft);
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="grid gap-5">
      {/* Header — issue meta */}
      <SurfaceCard overflow="visible">
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            Issue note details
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Issue number, date, department, and the person requesting the items.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Issue number</span>
            <input
              value={draft.issueNumber}
              readOnly
              aria-readonly="true"
              placeholder="MI-2026-0001"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#faf6f1] px-3 text-sm font-medium text-[#5c534d] outline-none cursor-not-allowed"
            />
            <span className="mt-1 block text-xs text-[#8c8079]">
              Auto-generated from the form-id config in Settings.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Issue date</span>
            <DateInput
              value={draft.issueDate}
              onChange={(value) => updateDraft({ issueDate: value })}
            />
          </label>

          <div className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Expense account</span>
            <div className="mt-1">
              <CategorizedAccountPicker
                value={draft.expenseAccount?.id ?? ""}
                displayLabel={
                  draft.expenseAccount
                    ? `${draft.expenseAccount.code} · ${draft.expenseAccount.name}`
                    : undefined
                }
                placeholder="Pick an expense account…"
                onChange={(acc) =>
                  updateDraft({
                    expenseAccount: acc && acc.categoryCode === "EXPENSES"
                      ? {
                          id: acc.id,
                          code: acc.code,
                          name: acc.name,
                          categoryCode: acc.categoryCode,
                        }
                      : null,
                  })
                }
              />
            </div>
            <span className="mt-1 block text-xs text-[#8c8079]">
              The expense account to charge for the issued items. Posts on the Dr side of the JE.
            </span>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Requested by</span>
            <input
              value={draft.requestedBy}
              onChange={(event) => updateDraft({ requestedBy: event.target.value })}
              placeholder="Person who raised the issue request"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-[#1f1d1c]">Purpose</span>
            <input
              value={draft.purpose}
              onChange={(event) => updateDraft({ purpose: event.target.value })}
              placeholder="Short summary of why these items are being issued"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
        </div>
      </SurfaceCard>

      {/* Line items */}
      <SurfaceCard
        overflow="visible"
        title="Items being issued"
        description="Add inventory items consumed by the department. Stock comes off the branch on approval."
      >
        <div className="grid gap-4">
          <div
            className={`grid gap-3 rounded-[24px] border p-4 xl:grid-cols-[1.3fr_1fr_0.45fr_0.65fr_1fr_auto] ${
              editingLineId ? "border-[#ffba82] bg-[#fff8f0]" : "border-[#e9dfd5] bg-[#fffaf5]"
            }`}
          >
            <div>
              <FieldLabel label="Item" />
              <AsyncItemSelect selectedItem={selectedItem} onSelect={handleItemSelect} />
            </div>
            <div>
              <FieldLabel label="Description" />
              <input
                value={lineDescription}
                onChange={(event) => setLineDescription(event.target.value)}
                placeholder="Item description"
                className="h-12 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </div>
            <div>
              <FieldLabel label="Qty" />
              <input
                inputMode="decimal"
                value={lineQty}
                onChange={(event) => {
                  setLineQty(sanitizeDecimal(event.target.value));
                  setLineQtyError(null);
                }}
                placeholder="1"
                className="h-12 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-right text-sm tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
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
              <FieldLabel label="Unit Cost (tentative)" />
              <input
                value={lineUnitCost}
                readOnly
                aria-readonly="true"
                placeholder="0.00"
                className="h-12 w-full rounded-2xl border border-[#eadfd5] bg-[#faf6f1] px-3 text-right text-sm tabular-nums text-[#5c534d] outline-none cursor-not-allowed"
              />
              <p className="mt-1.5 text-xs text-[#8c7f74]">
                Actual cost is the weighted-average from GRN history, computed at approval (§10).
              </p>
            </div>
            <div>
              <FieldLabel label="Line notes" />
              <input
                value={lineNotes}
                onChange={(event) => setLineNotes(event.target.value)}
                placeholder="Optional"
                className="h-12 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
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
                    {["#", "Product", "Description", "UOM", "Qty", "Unit Cost", "Line Total", ""].map((h) => (
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
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-[#5c534d]">
                        {line.description || "—"}
                        {line.notes ? (
                          <p className="mt-0.5 text-[11px] text-[#9b7a61]">{line.notes}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[#5c534d]">{line.uomName}</td>
                      <td className="px-4 py-3 text-right text-[#1f1d1c]">{line.quantity}</td>
                      <td className="px-4 py-3 text-right text-[#1f1d1c]">
                        {formatMoney(decimalAmount(line.unitCost), draft.currency || "LKR")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1f1d1c]">
                        {formatMoney(
                          decimalAmount(line.quantity) * decimalAmount(line.unitCost),
                          draft.currency || "LKR",
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

          {draft.lines.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm text-[#5f5750]">
                <span className="font-semibold text-[#1f1d1c]">{draft.lines.length}</span> item line(s)
              </p>
              <div className="grid gap-2 text-sm text-[#5f5750] sm:grid-cols-2 sm:text-right">
                <p>
                  Total Qty{" "}
                  <span className="font-semibold text-[#1f1d1c]">
                    {totalQty.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </span>
                </p>
                <p>
                  Total Value{" "}
                  <span className="font-semibold text-[#1f1d1c]">
                    {formatMoney(totalValue, draft.currency || "LKR")}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      {/* Notes */}
      <SurfaceCard>
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff1e2] text-[#a95915]"
            aria-hidden="true"
          >
            <StickyNote className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
              Notes
            </h2>
            <p className="mt-1 text-sm text-[#7b736d]">
              Optional context for the issue note — approver remarks, return-by date, or workflow context.
            </p>
            <textarea
              value={draft.notes}
              onChange={(event) => updateDraft({ notes: event.target.value })}
              rows={4}
              placeholder="Add any context that should appear on the issue note."
              className="mt-3 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 py-2 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}

// ─── Async product picker ────────────────────────────────────────────────

const ITEM_PAGE_SIZE = 20;

function FieldLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
      {label}
    </p>
  );
}

function AsyncItemSelect({
  selectedItem,
  onSelect,
}: {
  selectedItem: MaterialIssueItemOption | null;
  onSelect: (item: MaterialIssueItemOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MaterialIssueItemOption[]>([]);
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
      const res = await fetch(`/api/accounting/products/issue-options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: MaterialIssueItemOption[]; hasMore: boolean } | null;
      };
      if (payload.success && payload.data) {
        const fetched = payload.data.items;
        setHasMore(payload.data.hasMore);
        skipRef.current = skip + fetched.length;
        setItems((prev) => (append ? [...prev, ...fetched] : fetched));
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
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-[#eadfd5] bg-white px-3 text-left text-sm text-[#1f1d1c] outline-none transition hover:bg-[#fff7f0]"
      >
        <span className="flex min-w-0 flex-col">
          {selectedItem ? (
            <>
              <span className="truncate font-semibold text-[#1f1d1c]">
                {selectedItem.code}
              </span>
              <span className="truncate text-[11px] text-[#9b7a61]">{selectedItem.name}</span>
            </>
          ) : (
            <span className="text-[#a99d92]">Select item</span>
          )}
        </span>
        <ChevronDown
          className={`ml-2 h-4 w-4 shrink-0 text-[#9b8f87] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-14 z-20 overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.10)]">
          <div className="border-b border-[#f0e5dc] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
              <input
                value={query}
                onChange={(event) => handleSearch(event.target.value)}
                placeholder="Search items by code or name"
                className="h-10 w-full rounded-xl border border-[#eadfd5] bg-[#fffaf5] pl-9 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2" onScroll={handleScroll}>
            {items.length ? (
              <>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition hover:bg-[#fff8f0]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#1f1d1c]">
                        {item.code} · {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs leading-5 text-[#8c7f74]">
                        {item.uomName} · Stock: {item.stockOnHand} {item.uomBase}
                      </span>
                    </span>
                  </button>
                ))}
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
