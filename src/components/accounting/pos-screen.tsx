"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BadgeDollarSign,
  Check,
  ChevronDown,
  Coins,
  CreditCard,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBasket,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import type { PosProductOption } from "@/app/api/accounting/pos/products/route";
import type { ClientOption } from "@/app/api/accounting/clients/options/route";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";
import type { ViewerSummary } from "@/components/accounting/branch-aware-create-button";
import { CustomerQuickCreateModal } from "@/components/accounting/customer-quick-create-modal";

// ─── Types ────────────────────────────────────────────────────────────────

type CartLine = {
  id: string; // local — `${productId}-${timestamp}`
  productId: string;
  code: string;
  name: string;
  itemType: "INVENTORY_ITEM" | "VOUCHER";
  uomBase: string;
  uomMinQty: number;
  branchQtyOnHand: number;
  unitPrice: number;
  qty: string; // editable
  discount: string; // editable, per-line
  // Set on serial-tracked product lines (and voucher lines). When set,
  // the qty stepper is hidden — each serial is one indivisible unit.
  serialNumber: string | null;
};

type CustomerPick =
  | { kind: "walk-in" }
  | { kind: "registered"; id: string; name: string; mobile: string };

type CashAccountOption = {
  id: string;
  label: string;
};

const CASH_ACCOUNT_STORAGE_KEY = "pos-cash-account-id";

// All three header dropdowns (branch, cash account, hold bills) render
// through createPortal into document.body and use this hook to keep their
// panel positioned right-aligned to the trigger. Without the portal the
// panels were getting clipped/obscured by the page's stacking contexts —
// same fix as the branch-aware-create-button portal refactor.
function useTriggerAnchoredPanel({
  open,
  triggerRef,
  panelRef,
  width,
  onOutside,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  width: number;
  onOutside: () => void;
}): { left: number; top: number; width: number } | null {
  const [style, setStyle] = useState<{ left: number; top: number; width: number } | null>(null);

  // Keep latest onOutside in a ref so effect deps don't churn each render.
  // Without this, an inline `() => setOpen(false)` triggers an infinite
  // effect loop (setStyle → re-render → new onOutside identity → effect refires).
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  }, [onOutside]);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      let left = rect.right - width;
      if (left < margin) left = margin;
      const maxLeft = window.innerWidth - width - margin;
      if (left > maxLeft) left = maxLeft;
      setStyle({ left, top: rect.bottom + margin, width });
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        onOutsideRef.current();
      }
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, width, triggerRef, panelRef]);

  return style;
}

type ScreenViewer = ViewerSummary | null;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMoney(value: number): string {
  return `LKR ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
}

function makeLineId(productId: string): string {
  return `${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildPosBillNumber(config: { code: string; yearToken: string; nextNumber: string } | null): string {
  if (!config) return "POS-2026-0001";
  return [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()]
    .filter(Boolean)
    .join("-") || "POS-2026-0001";
}

const WALK_IN: CustomerPick = { kind: "walk-in" };

// ─── MIXED Account B picker (custom dropdown so we don't depend on
//     native <select> sizing — which overflowed the bill panel width
//     when the option label was long, e.g. "1218 SAMPATH CURRENT
//     ACCOUNT 1"). Renders its menu inline (panel is narrow enough
//     that escaping the parent's stacking context isn't needed). ───
function MixedAccountBPicker({
  cashAccounts,
  excludeId,
  value,
  onChange,
}: {
  cashAccounts: CashAccountOption[];
  excludeId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const options = cashAccounts.filter((a) => a.id !== excludeId);
  const current = options.find((a) => a.id === value);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-left text-sm text-white outline-none hover:border-white/20 focus:border-[#ff8e42]/60"
      >
        <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-white/40"}`}>
          {current?.label ?? "Select account"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-[14px] border border-white/15 bg-[#221a18] p-1 shadow-[0_18px_38px_rgba(0,0,0,0.4)]">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-white/40">No other cash accounts available.</p>
          ) : (
            options.map((opt) => {
              const picked = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    picked ? "bg-[#3a2418] text-[#ffb37c]" : "text-white/85 hover:bg-white/5"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {picked ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── SPLIT merchant picker (same pattern as MixedAccountBPicker;
//     filtered to isMerchant=true rows). Per § 3.6 / § 5.4. ───────
function SplitMerchantPicker({
  merchants,
  value,
  onChange,
}: {
  merchants: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const current = merchants.find((m) => m.id === value);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-left text-sm text-white outline-none hover:border-white/20 focus:border-[#ff8e42]/60"
      >
        <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-white/40"}`}>
          {current?.name ?? "Select merchant"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-[14px] border border-white/15 bg-[#221a18] p-1 shadow-[0_18px_38px_rgba(0,0,0,0.4)]">
          {merchants.length === 0 ? (
            <p className="px-3 py-2 text-xs text-white/40">
              No merchants flagged. Mark a customer as merchant first.
            </p>
          ) : (
            merchants.map((opt) => {
              const picked = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    picked ? "bg-[#3a2418] text-[#ffb37c]" : "text-white/85 hover:bg-white/5"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opt.name}</span>
                    {opt.contact ? (
                      <span className="block truncate text-[11px] text-white/40">{opt.contact}</span>
                    ) : null}
                  </span>
                  {picked ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

export function PosScreen() {
  const { viewer, branches, loading: viewerLoading, error: viewerError } = useViewerAndBranches();

  // Branch resolution — branch users auto-set, super admin picks.
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  useEffect(() => {
    if (viewer && viewer.role !== "SUPER_ADMIN") {
      setPickedStoreId(viewer.storeId);
    }
  }, [viewer]);

  const effectiveStoreId = pickedStoreId;
  const isSuperAdmin = viewer?.role === "SUPER_ADMIN";
  const effectiveBranch = effectiveStoreId
    ? branches.find((b) => b.id === effectiveStoreId) ?? null
    : null;

  // Header data
  const [billNumber, setBillNumber] = useState<string>("POS-2026-0001");

  useEffect(() => {
    void fetch("/api/accounting/settings/form-ids", { headers: { "x-portal": "ACCOUNTING" } })
      .then(async (r) => {
        const j = (await r.json()) as {
          success: boolean;
          data: { items: { formType: string; code: string; yearToken: string; nextNumber: string }[] } | null;
        };
        if (j.success && j.data) {
          const pos = j.data.items.find((i) => i.formType === "POS");
          if (pos) setBillNumber(buildPosBillNumber(pos));
        }
      })
      .catch(() => {
        /* leave fallback */
      });
  }, []);

  // Cash & Cash Equivalents picker (receive-to account for the POS bill).
  // Defaults to the first option in the list. Selection persists in
  // localStorage so the cashier doesn't need to re-pick on every reload.
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string | null>(null);
  const [cashAccountPickerOpen, setCashAccountPickerOpen] = useState(false);
  const cashAccountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cashAccountPanelRef = useRef<HTMLDivElement | null>(null);
  const cashAccountPanelStyle = useTriggerAnchoredPanel({
    open: cashAccountPickerOpen,
    triggerRef: cashAccountTriggerRef,
    panelRef: cashAccountPanelRef,
    width: 320,
    onOutside: () => setCashAccountPickerOpen(false),
  });

  useEffect(() => {
    let cancelled = false;
    void fetch(
      "/api/accounting/accounts/options?category=ASSET&type=CASH_AND_CASH_EQUIVALENTS&limit=50",
      { headers: { "x-portal": "ACCOUNTING" } },
    )
      .then(async (r) => {
        const j = (await r.json()) as {
          success: boolean;
          data: { items: CashAccountOption[] } | null;
        };
        if (cancelled) return;
        if (j.success && j.data) {
          const list = j.data.items;
          setCashAccounts(list);
          // Restore from localStorage if the saved id is still valid; else
          // default to the first option in the list.
          let saved: string | null = null;
          try {
            saved = window.localStorage.getItem(CASH_ACCOUNT_STORAGE_KEY);
          } catch {
            /* localStorage may be unavailable in private mode — fall back to default */
          }
          const valid = saved && list.some((a) => a.id === saved) ? saved : list[0]?.id ?? null;
          setSelectedCashAccountId(valid);
        }
      })
      .catch(() => {
        /* keep empty; UI handles the empty state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCashAccountId) return;
    try {
      window.localStorage.setItem(CASH_ACCOUNT_STORAGE_KEY, selectedCashAccountId);
    } catch {
      /* no-op */
    }
  }, [selectedCashAccountId]);

  const selectedCashAccount = useMemo(
    () => cashAccounts.find((a) => a.id === selectedCashAccountId) ?? null,
    [cashAccounts, selectedCashAccountId],
  );

  // Customer dropdown state. The actual source of truth is the server
  // bill's `customerId`; this local state is only used while there's
  // no live bill yet so the user's pick survives until the first
  // add-line. Once a bill exists, every change PATCHes the server
  // bill and the local state is re-derived from the response.
  const [customer, setCustomer] = useState<CustomerPick>(WALK_IN);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerQuickOpen, setCustomerQuickOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<ClientOption[]>([]);
  const [customerHasMore, setCustomerHasMore] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const customerSkipRef = useRef(0);
  const customerLoadingRef = useRef(false);
  const customerListRef = useRef<HTMLDivElement | null>(null);

  const fetchCustomers = useCallback(async (q: string, skip: number, append: boolean) => {
    if (customerLoadingRef.current) return;
    customerLoadingRef.current = true;
    setCustomerLoading(true);
    try {
      const params = new URLSearchParams({ q, skip: String(skip), take: "20" });
      const res = await fetch(`/api/accounting/clients/options?${params}`);
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: ClientOption[]; hasMore: boolean } | null;
      };
      if (payload.success && payload.data) {
        const fetched = payload.data.items;
        setCustomerHasMore(payload.data.hasMore);
        customerSkipRef.current = skip + fetched.length;
        setCustomerOptions((prev) => (append ? [...prev, ...fetched] : fetched));
      }
    } finally {
      customerLoadingRef.current = false;
      setCustomerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customerPickerOpen) return;
    customerSkipRef.current = 0;
    void fetchCustomers("", 0, false);
  }, [customerPickerOpen, fetchCustomers]);

  useEffect(() => {
    if (!customerPickerOpen) return;
    const timer = setTimeout(() => {
      customerSkipRef.current = 0;
      void fetchCustomers(customerQuery, 0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerQuery, customerPickerOpen, fetchCustomers]);

  function handleCustomerScroll() {
    const el = customerListRef.current;
    if (!el || !customerHasMore || customerLoadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      void fetchCustomers(customerQuery, customerSkipRef.current, true);
    }
  }

  // Products (branch-scoped)
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [products, setProducts] = useState<PosProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  // Bumped by the manual refresh button; included in the products
  // fetch effect's dependency list so a click re-fires the request
  // even when search term and branch are unchanged.
  const [productsRefreshNonce, setProductsRefreshNonce] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!effectiveStoreId) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);
    void fetch(
      `/api/accounting/pos/products?storeId=${encodeURIComponent(effectiveStoreId)}&q=${encodeURIComponent(debouncedTerm)}&take=24`,
      { headers: { "x-portal": "ACCOUNTING" } },
    )
      .then(async (r) => {
        if (cancelled) return;
        const j = (await r.json()) as {
          success: boolean;
          data: { items: PosProductOption[] } | null;
          message?: string;
        };
        if (j.success && j.data) {
          setProducts(j.data.items);
        } else {
          setProductsError(j.message || "Failed to load products.");
        }
      })
      .catch(() => {
        if (!cancelled) setProductsError("Network error while loading products.");
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveStoreId, debouncedTerm, productsRefreshNonce]);

  // ─── Server bill state ────────────────────────────────────────────
  // The live cart is a server-side AccountingPosBill row with
  // status=DRAFT, isHeld=false. Lines persist across page reloads and
  // tab switches; reservation is visible to other cashiers in real
  // time via the products endpoint join. See pos-integration-flow.md
  // § 4.2 (schema), § 5.5 (line endpoints), § 8.2 (reservation).
  type PosBillDto = {
    id: string;
    billNo: string;
    status: "DRAFT" | "COMPLETED" | "CANCELLED";
    isHeld: boolean;
    storeId: string;
    cashierId: string;
    cashierName: string;
    customerId: string;
    customerName: string;
    customerIsWalkIn: boolean;
    merchantClientId: string | null;
    merchantName: string | null;
    paymentMethod: "CASH" | "CARD" | "MIXED" | "SPLIT" | null;
    primaryCashAccountId: string | null;
    subtotal: string;
    totalDiscount: string;
    total: string;
    postedAt: string | null;
    lines: Array<{
      id: string;
      productId: string;
      productCode: string;
      productName: string;
      qty: string;
      unitPrice: string;
      discount: string;
      lineTotal: string;
      uomBase: string;
      uomMinQty: string;
      voucherSerialId: string | null;
      voucherSerialNumber: string | null;
      productSerialId: string | null;
      productSerialNumber: string | null;
      lineOrder: number;
    }>;
    payments: Array<{
      id: string;
      method: "CASH" | "CARD" | "SPLIT" | "REDEEM_VOUCHER";
      cashAccountId: string | null;
      cashAccountLabel: string | null;
      merchantClientId: string | null;
      merchantName: string | null;
      voucherSerialId: string | null;
      voucherSerialNumber: string | null;
      amount: string;
      rowOrder: number;
    }>;
  };

  const [serverBill, setServerBill] = useState<PosBillDto | null>(null);
  const [billLoading, setBillLoading] = useState(false);

  // Load the cashier's active DRAFT on store change. If none exists,
  // serverBill stays null and the screen renders an empty cart — the
  // first add-line click mints a new bill server-side.
  useEffect(() => {
    if (!effectiveStoreId) {
      setServerBill(null);
      return;
    }
    let cancelled = false;
    setBillLoading(true);
    void fetch(`/api/accounting/pos/bills?storeId=${effectiveStoreId}`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (r) => {
        const j = (await r.json()) as { success: boolean; data: { bill: PosBillDto | null } | null; message?: string };
        if (cancelled) return;
        if (j.success && j.data) {
          setServerBill(j.data.bill);
        }
      })
      .catch(() => {
        if (!cancelled) setToast("Unable to load active bill.");
      })
      .finally(() => {
        if (!cancelled) setBillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveStoreId]);

  // Map the server bill's line rows into the local CartLine shape so
  // the existing render code keeps working unchanged.
  const cart: CartLine[] = useMemo(() => {
    if (!serverBill) return [];
    return serverBill.lines.map((line) => {
      // Available qty is enforced server-side, but we surface a
      // best-effort `branchQtyOnHand` for the qty stepper UI. Look
      // up the matching product (which carries the live availability
      // count) — falls back to the line qty if the product list
      // hasn't loaded yet.
      const product = products.find((p) => p.id === line.productId);
      const onHand = product
        ? Number(line.qty) + Number(product.branchAvailableQty)
        : Number(line.qty);
      // A line carries either a voucherSerialNumber, a productSerialNumber,
      // or neither. Use whichever is set to drive the "fixed qty 1, serial
      // shown" UI path.
      const serialNumber = line.voucherSerialNumber ?? line.productSerialNumber ?? null;
      const itemType: "INVENTORY_ITEM" | "VOUCHER" = line.voucherSerialId
        ? "VOUCHER"
        : "INVENTORY_ITEM";
      return {
        id: line.id,
        productId: line.productId,
        code: line.productCode,
        name: line.productName,
        itemType,
        uomBase: line.uomBase,
        uomMinQty: Number(line.uomMinQty) || 1,
        branchQtyOnHand: onHand,
        unitPrice: Number(line.unitPrice),
        qty: line.qty,
        discount: line.discount,
        serialNumber,
      };
    });
  }, [serverBill, products]);

  // ─── Bill mutators (all hit the server, then store the response) ───

  async function callBillEndpoint(label: string, fn: () => Promise<Response>) {
    try {
      const r = await fn();
      const j = (await r.json()) as { success: boolean; message: string; data?: { bill?: PosBillDto } };
      if (!r.ok || !j.success) {
        setToast(j.message || `${label} failed.`);
        return false;
      }
      if (j.data?.bill) setServerBill(j.data.bill);
      return true;
    } catch {
      setToast(`${label} failed — network error.`);
      return false;
    }
  }

  async function addToCart(product: PosProductOption) {
    if (!effectiveStoreId) {
      setToast("Pick a branch first.");
      return;
    }
    // Voucher products require picking a specific serial — open the
    // serial picker popup. The actual add-line call fires after the
    // cashier picks one (or cancels).
    if (product.itemType === "VOUCHER") {
      void openVoucherSerialPicker(product);
      return;
    }
    // Serial-tracked inventory items: same flow, different picker —
    // each unit on the shelf has its own serial and must be chosen.
    if (product.serialTrackingEnabled) {
      void openProductSerialPicker(product);
      return;
    }
    await callBillEndpoint("Add to bill", () =>
      fetch("/api/accounting/pos/bills/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({
          storeId: effectiveStoreId,
          productId: product.id,
          qty: Number(product.uomMinQty) || 1,
        }),
      }),
    );
  }

  // ─── Voucher serial picker (per theory § 7.3 — pick which
  //     specific serial is being sold). The popup lists ACTIVE
  //     serials at the branch (excluded if already in any DRAFT
  //     or COMPLETED bill line). On pick, fires the add-line call
  //     with the chosen serial; the line "soft-locks" the serial
  //     until the bill is paid or the line is removed (which
  //     releases the serial back into the picker pool).
  type ActiveSerialOption = {
    serialId: string;
    serialNumber: string;
    faceValue: string;
  };
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const [voucherPickerProduct, setVoucherPickerProduct] =
    useState<PosProductOption | null>(null);
  const [voucherSerialOptions, setVoucherSerialOptions] = useState<
    ActiveSerialOption[]
  >([]);
  const [voucherSerialsLoading, setVoucherSerialsLoading] = useState(false);

  async function openVoucherSerialPicker(product: PosProductOption) {
    setVoucherPickerProduct(product);
    setVoucherPickerOpen(true);
    setVoucherSerialsLoading(true);
    setVoucherSerialOptions([]);
    try {
      const r = await fetch(
        `/api/accounting/pos/voucher-serials/active?storeId=${effectiveStoreId}&productId=${product.id}`,
        { headers: { "x-portal": "ACCOUNTING" } },
      );
      const j = (await r.json()) as {
        success: boolean;
        message: string;
        data: { items: ActiveSerialOption[] } | null;
      };
      if (!r.ok || !j.success) {
        setToast(j.message || "Could not load voucher serials.");
        setVoucherPickerOpen(false);
        return;
      }
      setVoucherSerialOptions(j.data?.items ?? []);
    } catch {
      setToast("Voucher lookup failed — network error.");
      setVoucherPickerOpen(false);
    } finally {
      setVoucherSerialsLoading(false);
    }
  }

  async function pickVoucherSerial(serialId: string) {
    if (!effectiveStoreId || !voucherPickerProduct) return;
    setVoucherPickerOpen(false);
    await callBillEndpoint("Add voucher to bill", () =>
      fetch("/api/accounting/pos/bills/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({
          storeId: effectiveStoreId,
          productId: voucherPickerProduct.id,
          qty: 1,
          voucherSerialId: serialId,
        }),
      }),
    );
    setVoucherPickerProduct(null);
  }

  function closeVoucherSerialPicker() {
    setVoucherPickerOpen(false);
    setVoucherPickerProduct(null);
    setVoucherSerialOptions([]);
  }

  // ─── Product serial picker (non-voucher serial-tracked items).
  //     Same soft-lock + ACTIVE-only semantics as the voucher picker;
  //     each serial-tracked product line carries one chosen
  //     productSerialId, qty=1.
  type ActiveProductSerialOption = { serialId: string; serialNumber: string };
  const [productSerialPickerOpen, setProductSerialPickerOpen] = useState(false);
  const [productSerialPickerProduct, setProductSerialPickerProduct] =
    useState<PosProductOption | null>(null);
  const [productSerialOptions, setProductSerialOptions] = useState<
    ActiveProductSerialOption[]
  >([]);
  const [productSerialsLoading, setProductSerialsLoading] = useState(false);

  async function openProductSerialPicker(product: PosProductOption) {
    setProductSerialPickerProduct(product);
    setProductSerialPickerOpen(true);
    setProductSerialsLoading(true);
    setProductSerialOptions([]);
    try {
      const r = await fetch(
        `/api/accounting/pos/product-serials/active?storeId=${effectiveStoreId}&productId=${product.id}`,
        { headers: { "x-portal": "ACCOUNTING" } },
      );
      const j = (await r.json()) as {
        success: boolean;
        message: string;
        data: { items: ActiveProductSerialOption[] } | null;
      };
      if (!r.ok || !j.success) {
        setToast(j.message || "Could not load serial numbers.");
        setProductSerialPickerOpen(false);
        return;
      }
      setProductSerialOptions(j.data?.items ?? []);
    } catch {
      setToast("Serial lookup failed — network error.");
      setProductSerialPickerOpen(false);
    } finally {
      setProductSerialsLoading(false);
    }
  }

  async function pickProductSerial(serialId: string) {
    if (!effectiveStoreId || !productSerialPickerProduct) return;
    setProductSerialPickerOpen(false);
    await callBillEndpoint("Add to bill", () =>
      fetch("/api/accounting/pos/bills/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({
          storeId: effectiveStoreId,
          productId: productSerialPickerProduct.id,
          qty: 1,
          productSerialId: serialId,
        }),
      }),
    );
    setProductSerialPickerProduct(null);
  }

  function closeProductSerialPicker() {
    setProductSerialPickerOpen(false);
    setProductSerialPickerProduct(null);
    setProductSerialOptions([]);
  }

  // ─── POS Bill History (header → "History" button) ─────────────
  // Big modal with search + payment-method filter + paginated
  // table. Each row supports View (opens summary popup) and Reprint
  // (opens the receipt route in a new window with auto-print).
  type HistoryItem = {
    id: string;
    billNo: string;
    postedAt: string;
    customerId: string;
    customerName: string;
    customerIsWalkIn: boolean;
    merchantClientId: string | null;
    merchantName: string | null;
    paymentMethod: "CASH" | "CARD" | "MIXED" | "SPLIT";
    total: string;
    itemCount: number;
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyMethodFilter, setHistoryMethodFilter] = useState<
    "" | "CASH" | "CARD" | "MIXED" | "SPLIT"
  >("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 20;

  // Debounce-fetch on filter / search / page changes while modal is open.
  useEffect(() => {
    if (!historyOpen || !effectiveStoreId) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setHistoryLoading(true);
      const params = new URLSearchParams({
        storeId: effectiveStoreId,
        skip: String(historyPage * HISTORY_PAGE_SIZE),
        take: String(HISTORY_PAGE_SIZE),
      });
      if (historyQuery.trim()) params.set("q", historyQuery.trim());
      if (historyMethodFilter) params.set("method", historyMethodFilter);
      void fetch(`/api/accounting/pos/bills/history?${params.toString()}`, {
        headers: { "x-portal": "ACCOUNTING" },
      })
        .then(async (r) => {
          const j = (await r.json()) as {
            success: boolean;
            data: { items: HistoryItem[]; total: number } | null;
          };
          if (cancelled) return;
          if (j.success && j.data) {
            setHistoryItems(j.data.items);
            setHistoryTotal(j.data.total);
          } else {
            setHistoryItems([]);
            setHistoryTotal(0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHistoryItems([]);
            setHistoryTotal(0);
          }
        })
        .finally(() => {
          if (!cancelled) setHistoryLoading(false);
        });
    }, historyQuery ? 300 : 0); // debounce typed query
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [historyOpen, effectiveStoreId, historyQuery, historyMethodFilter, historyPage]);

  // Reset page back to 0 when the filter or search query changes.
  useEffect(() => {
    setHistoryPage(0);
  }, [historyQuery, historyMethodFilter]);

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryQuery("");
    setHistoryMethodFilter("");
    setHistoryPage(0);
  }

  // Reprint: open the receipt URL in a popup; window.print() fires
  // automatically when the receipt's onload runs (same path the live
  // Pay flow uses).
  function reprintBill(billId: string) {
    try {
      const win = window.open(
        `/api/accounting/pos/bills/${billId}/receipt`,
        "_blank",
        "popup=yes,width=420,height=720",
      );
      if (win) {
        win.addEventListener("load", () => {
          try {
            win.focus();
            win.print();
          } catch {
            /* user can manually print */
          }
        });
      }
    } catch {
      setToast("Could not open receipt — popup blocked?");
    }
  }

  // ─── History → View summary popup ──────────────────────────────
  const [historyViewBill, setHistoryViewBill] = useState<PosBillDto | null>(null);
  const [historyViewLoading, setHistoryViewLoading] = useState(false);

  async function openHistoryView(billId: string) {
    setHistoryViewLoading(true);
    setHistoryViewBill(null);
    try {
      const r = await fetch(`/api/accounting/pos/bills/${billId}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const j = (await r.json()) as {
        success: boolean;
        message: string;
        data: { bill: PosBillDto } | null;
      };
      if (!r.ok || !j.success || !j.data) {
        setToast(j.message || "Could not load bill detail.");
        return;
      }
      setHistoryViewBill(j.data.bill);
    } catch {
      setToast("Could not load bill detail — network error.");
    } finally {
      setHistoryViewLoading(false);
    }
  }

  function closeHistoryView() {
    setHistoryViewBill(null);
    setHistoryViewLoading(false);
  }

  async function updateCartLine(id: string, patch: Partial<Pick<CartLine, "qty" | "discount">>) {
    if (!serverBill) return;
    const body: Record<string, number> = {};
    if (patch.qty !== undefined) body.qty = Number(patch.qty);
    if (patch.discount !== undefined) body.discount = Number(patch.discount);
    if (Object.keys(body).length === 0) return;
    await callBillEndpoint("Update line", () =>
      fetch(`/api/accounting/pos/bills/${serverBill.id}/lines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify(body),
      }),
    );
  }

  async function adjustQty(id: string, delta: number) {
    const line = cart.find((l) => l.id === id);
    if (!line) return;
    const minQty = line.uomMinQty || 1;
    const next = Math.max(minQty, (Number(line.qty) || 0) + delta * minQty);
    await updateCartLine(id, { qty: next.toString() });
  }

  async function removeCartLine(id: string) {
    if (!serverBill) return;
    await callBillEndpoint("Remove line", () =>
      fetch(`/api/accounting/pos/bills/${serverBill.id}/lines/${id}`, {
        method: "DELETE",
        headers: { "x-portal": "ACCOUNTING" },
      }),
    );
  }

  async function clearCart() {
    if (!serverBill) return;
    await callBillEndpoint("Clear bill", () =>
      fetch(`/api/accounting/pos/bills/${serverBill.id}/clear`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      }),
    );
  }

  // Totals — read directly from the server bill (single source of truth).
  const totals = useMemo(() => {
    if (!serverBill) return { subtotal: 0, totalDiscount: 0, totalDue: 0 };
    return {
      subtotal: Number(serverBill.subtotal),
      totalDiscount: Number(serverBill.totalDiscount),
      totalDue: Number(serverBill.total),
    };
  }, [serverBill]);

  // ─── Payment method state ─────────────────────────────────────────
  // Per accounting-theories.md § 7.1 / § 7.2 and pos-integration-flow.md
  // § 3.1 / § 5.4. Defaults to CASH; the cashier picks one of four
  // tender methods before pressing "Complete bill".
  type PaymentMethod = "CASH" | "CARD" | "MIXED" | "SPLIT";
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  // For MIXED tender: the secondary cash account (the "second chip")
  // and the two amount strings the cashier types in. Per § 8.6 the
  // primary chip's account is remembered for the next bill; the
  // secondary is per-bill only.
  const [mixedSecondaryAccountId, setMixedSecondaryAccountId] = useState<string | null>(null);
  const [mixedPrimaryAmount, setMixedPrimaryAmount] = useState<string>("");
  const [mixedSecondaryAmount, setMixedSecondaryAmount] = useState<string>("");

  // For SPLIT tender: the picked merchant. When SPLIT is active the
  // top customer dropdown must hold a registered customer (Walk-in
  // is rejected per § 3.6). The merchant pool is fetched on demand.
  const [splitMerchantId, setSplitMerchantId] = useState<string | null>(null);
  const [splitMerchants, setSplitMerchants] = useState<ClientOption[]>([]);

  // Apply Voucher tender (theory § 7.4). Single voucher per bill in
  // this phase. Cashier types/scans the serial, the screen looks it
  // up, and on success appends a REDEEM_VOUCHER row to the
  // completeBill() payments[].
  type AppliedVoucher = {
    serialId: string;
    serialNumber: string;
    faceValue: number; // amount that will hit the liability account
    productName: string;
  };
  const [voucherSerialInput, setVoucherSerialInput] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherLookupBusy, setVoucherLookupBusy] = useState(false);

  // Cashier's reckoning aid — what the customer handed over, so the
  // screen computes the change automatically. Front-end only: this
  // value is NEVER sent to the server. The actual posting math runs
  // off `totals.totalDue` regardless of what's typed here. Reset to
  // empty when the bill resets after Pay.
  const [cashGivenInput, setCashGivenInput] = useState("");
  async function applyVoucher() {
    const q = voucherSerialInput.trim();
    if (!q) return;
    setVoucherLookupBusy(true);
    try {
      const r = await fetch(
        `/api/accounting/pos/voucher-serials/lookup?serial=${encodeURIComponent(q)}`,
        { headers: { "x-portal": "ACCOUNTING" } },
      );
      const j = (await r.json()) as {
        success: boolean;
        message: string;
        data: {
          serialId: string;
          serialNumber: string;
          faceValue: string;
          productCode: string;
          productName: string;
        } | null;
      };
      if (!r.ok || !j.success || !j.data) {
        setToast(j.message || "Voucher lookup failed.");
        return;
      }
      // Cap rule: voucher face value can't exceed bill total — § 9.4.2.
      const face = Number(j.data.faceValue);
      if (face > totals.totalDue + 1e-6) {
        setToast(
          `Voucher face value ${face.toFixed(2)} exceeds bill total ${totals.totalDue.toFixed(2)}. Add more items or skip the voucher.`,
        );
        return;
      }
      setAppliedVoucher({
        serialId: j.data.serialId,
        serialNumber: j.data.serialNumber,
        faceValue: face,
        productName: j.data.productName,
      });
      setVoucherSerialInput("");
      setToast(`Voucher ${j.data.serialNumber} applied (LKR ${face.toFixed(2)}).`);
    } catch {
      setToast("Voucher lookup failed — network error.");
    } finally {
      setVoucherLookupBusy(false);
    }
  }
  function clearAppliedVoucher() {
    setAppliedVoucher(null);
  }

  useEffect(() => {
    if (paymentMethod !== "SPLIT" || splitMerchants.length > 0) return;
    let cancelled = false;
    // `merchantsOnly=true` filters the options endpoint to
    // isMerchant=true rows only — exactly the merchant pool the SPLIT
    // tender picker needs (per § 3.7).
    void fetch("/api/accounting/clients/options?merchantsOnly=true&take=50", {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (r) => {
        const j = (await r.json()) as {
          success: boolean;
          data: { items: ClientOption[] } | null;
        };
        if (cancelled) return;
        if (j.success && j.data) {
          setSplitMerchants(j.data.items);
        }
      })
      .catch(() => {
        /* silent — toast happens at pay time if list is empty */
      });
    return () => {
      cancelled = true;
    };
  }, [paymentMethod, splitMerchants.length]);

  // When MIXED is picked, default the primary amount to the bill total
  // (so the cashier just types the secondary split). When the bill
  // total changes (qty edits / discount), prefill the primary again.
  useEffect(() => {
    if (paymentMethod !== "MIXED") {
      setMixedPrimaryAmount("");
      setMixedSecondaryAmount("");
      return;
    }
    const due = totals.totalDue;
    setMixedPrimaryAmount(due > 0 ? due.toFixed(2) : "");
    setMixedSecondaryAmount("0.00");
  }, [paymentMethod, totals.totalDue]);

  // SPLIT walk-in guard: if cashier picks SPLIT while customer is
  // walk-in, surface a toast and refuse to flip — they must pick a
  // registered customer first.
  function pickPaymentMethod(method: PaymentMethod) {
    if (method === "SPLIT" && customer.kind === "walk-in") {
      setToast("SPLIT requires a registered customer. Pick one above first.");
      return;
    }
    setPaymentMethod(method);
  }

  // ─── Complete bill flow ─────────────────────────────────────────
  // Posts to /pay, which writes payment rows, sets summary fields,
  // posts GL entries via postPosBillApproval, and decrements stock —
  // all in one transaction.
  const [payInFlight, setPayInFlight] = useState(false);

  async function completeBill() {
    if (!serverBill) {
      setToast("No bill to complete.");
      return;
    }
    if (cart.length === 0) {
      setToast("Add at least one item before completing the bill.");
      return;
    }

    // Build the payments[] payload based on the picked method.
    type PaymentRow = { method: "CASH" | "CARD" | "SPLIT" | "REDEEM_VOUCHER"; cashAccountId?: string; merchantClientId?: string; voucherSerialId?: string; amount: number };
    const payments: PaymentRow[] = [];
    let summaryMethod: PaymentMethod = paymentMethod;
    let primary: string | null = selectedCashAccountId;

    // Voucher tender (per theory § 7.4) prepends to the payments
    // array; the rest of the bill is paid via the picked
    // CASH/CARD/MIXED/SPLIT method on the remaining balance.
    const voucherAmount = appliedVoucher?.faceValue ?? 0;
    const remainderToCover = totals.totalDue - voucherAmount;
    if (appliedVoucher && voucherAmount > 0) {
      payments.push({
        method: "REDEEM_VOUCHER",
        voucherSerialId: appliedVoucher.serialId,
        amount: voucherAmount,
      });
      // When a voucher fully covers the bill, the user can stay on
      // CASH method but no cash row is needed. Force summary to MIXED
      // for clarity when there's both voucher + cash side.
      if (remainderToCover > 0.01 && (paymentMethod === "CASH" || paymentMethod === "CARD")) {
        summaryMethod = "MIXED";
      }
    }

    if (paymentMethod === "CASH" || paymentMethod === "CARD") {
      if (remainderToCover <= 0.01) {
        // Voucher covered the whole bill — no cash row needed.
      } else {
        if (!selectedCashAccountId) {
          setToast("Pick a cash / cash-equivalent account in the header.");
          return;
        }
        payments.push({
          method: paymentMethod,
          cashAccountId: selectedCashAccountId,
          amount: remainderToCover,
        });
      }
    } else if (paymentMethod === "MIXED") {
      const a = Number(mixedPrimaryAmount);
      const b = Number(mixedSecondaryAmount);
      if (!selectedCashAccountId || !mixedSecondaryAccountId) {
        setToast("Pick both cash accounts for a Mixed payment.");
        return;
      }
      if (selectedCashAccountId === mixedSecondaryAccountId) {
        setToast("Mixed payment needs two distinct cash accounts.");
        return;
      }
      if (Math.abs(a + b - totals.totalDue) > 0.01) {
        setToast(`Amounts must sum to ${totals.totalDue.toFixed(2)} — currently ${(a + b).toFixed(2)}.`);
        return;
      }
      if (a > 0) {
        payments.push({ method: "CASH", cashAccountId: selectedCashAccountId, amount: a });
      }
      if (b > 0) {
        payments.push({ method: "CASH", cashAccountId: mixedSecondaryAccountId, amount: b });
      }
      primary = selectedCashAccountId;
    } else if (paymentMethod === "SPLIT") {
      if (customer.kind !== "registered") {
        setToast("Pick a registered customer for a Split bill.");
        return;
      }
      if (!splitMerchantId) {
        setToast("Pick a merchant for the Split tender.");
        return;
      }
      payments.push({
        method: "SPLIT",
        merchantClientId: splitMerchantId,
        amount: totals.totalDue,
      });
      primary = null;
    }

    setPayInFlight(true);
    try {
      const r = await fetch(`/api/accounting/pos/bills/${serverBill.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({
          paymentMethod: summaryMethod,
          payments,
          primaryCashAccountId: primary,
        }),
      });
      const j = (await r.json()) as { success: boolean; message: string; data?: { bill?: PosBillDto; phaseStub?: boolean } };
      if (!r.ok || !j.success) {
        setToast(j.message || "Pay failed.");
        return;
      }
      // Bill is now COMPLETED — open the thermal receipt in a popup
      // window. The receipt route returns inline HTML with a 72mm
      // print stylesheet; the cashier can hit Cmd/Ctrl-P or the
      // browser's auto-print bridge.
      const completedId = serverBill.id;
      const completedBillNo = j.data?.bill?.billNo ?? serverBill.billNo;
      try {
        const win = window.open(
          `/api/accounting/pos/bills/${completedId}/receipt`,
          "_blank",
          "popup=yes,width=420,height=720",
        );
        // Auto-trigger the print dialog once the receipt HTML loads.
        if (win) {
          win.addEventListener("load", () => {
            try {
              win.focus();
              win.print();
            } catch {
              /* user can manually print */
            }
          });
        }
      } catch {
        /* popup blocked — toast still confirms the bill posted */
      }

      // Clear local state so the screen returns to "no draft" and the
      // next add-line mints a fresh bill with the next sequential number.
      setServerBill(null);
      setPaymentMethod("CASH");
      setMixedPrimaryAmount("");
      setMixedSecondaryAmount("");
      setMixedSecondaryAccountId(null);
      setSplitMerchantId(null);
      setAppliedVoucher(null);
      setCashGivenInput("");
      // Refresh the product list so stock-on-hand reflects what
      // just got sold — otherwise the next cashier scan would show
      // a stale quantity for items moved by this bill.
      setProductsRefreshNonce((n) => n + 1);
      setToast(`Bill ${completedBillNo} closed — receipt opened in new window.`);
    } catch {
      setToast("Pay failed — network error.");
    } finally {
      setPayInFlight(false);
    }
  }

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Hold bills (UI-only mock until persistence lands)
  const [holdBillsOpen, setHoldBillsOpen] = useState(false);
  type HeldBillSummary = {
    id: string;
    billNo: string;
    customerName: string;
    customerIsWalkIn: boolean;
    total: string;
    heldAt: string | null;
    heldNote: string | null;
    lineCount: number;
  };
  const [heldBills, setHeldBills] = useState<HeldBillSummary[]>([]);

  // Refresh the holds list when the panel opens or the store changes.
  // Per pos-integration-flow.md § 5.6 holds are scoped per-cashier so
  // the current viewer's session token implicitly filters this.
  const refreshHolds = useCallback(async () => {
    if (!effectiveStoreId) return;
    try {
      const r = await fetch(`/api/accounting/pos/holds?storeId=${effectiveStoreId}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const j = (await r.json()) as { success: boolean; data: { items: HeldBillSummary[] } | null };
      if (j.success && j.data) setHeldBills(j.data.items);
    } catch {
      /* silent — toast on user-initiated actions only */
    }
  }, [effectiveStoreId]);

  useEffect(() => {
    if (holdBillsOpen) void refreshHolds();
  }, [holdBillsOpen, refreshHolds]);

  async function holdCurrentBill(note?: string) {
    if (!serverBill) {
      setToast("Nothing to hold — add at least one item first.");
      return;
    }
    const ok = await callBillEndpoint("Hold bill", () =>
      fetch(`/api/accounting/pos/bills/${serverBill.id}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({ note: note ?? null }),
      }),
    );
    if (ok) {
      // The server flipped isHeld=true. Drop the local state — the
      // load effect will see no live draft and show an empty cart.
      setServerBill(null);
      // Held lines still reserve stock, so the available qtyOnHand
      // visible to other cashiers needs a refresh.
      setProductsRefreshNonce((n) => n + 1);
      setToast("Bill held.");
    }
  }

  async function resumeHeldBill(billId: string) {
    const ok = await callBillEndpoint("Resume bill", () =>
      fetch(`/api/accounting/pos/bills/${billId}/resume`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      }),
    );
    if (ok) {
      setHoldBillsOpen(false);
      void refreshHolds();
    }
  }

  async function deleteHeldBill(billId: string) {
    try {
      const r = await fetch(`/api/accounting/pos/bills/${billId}`, {
        method: "DELETE",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const j = (await r.json()) as { success: boolean; message: string };
      if (!j.success) {
        setToast(j.message || "Unable to delete held bill.");
        return;
      }
      setToast(`Held bill deleted (number burned).`);
      void refreshHolds();
    } catch {
      setToast("Unable to delete held bill.");
    }
  }

  // Branch picker dropdown for super admin
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const branchPickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const branchPickerPanelRef = useRef<HTMLDivElement | null>(null);
  const branchPickerPanelStyle = useTriggerAnchoredPanel({
    open: branchPickerOpen,
    triggerRef: branchPickerTriggerRef,
    panelRef: branchPickerPanelRef,
    width: 288,
    onOutside: () => setBranchPickerOpen(false),
  });

  // Customer popover close-on-outside-click
  const customerWrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!customerPickerOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!customerWrapperRef.current) return;
      if (!customerWrapperRef.current.contains(event.target as Node)) {
        setCustomerPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [customerPickerOpen]);

  // Hold-bill popover positioning
  const holdTriggerRef = useRef<HTMLButtonElement | null>(null);
  const holdPanelRef = useRef<HTMLDivElement | null>(null);
  const holdPanelStyle = useTriggerAnchoredPanel({
    open: holdBillsOpen,
    triggerRef: holdTriggerRef,
    panelRef: holdPanelRef,
    width: 288,
    onOutside: () => setHoldBillsOpen(false),
  });

  // ─── Customer change wiring ───────────────────────────────────────
  // When a server bill exists, customer changes PATCH the bill row.
  // When no bill exists yet (cart empty), the local pick survives until
  // the first add-line — at which point the bill is minted with the
  // walk-in seed and a separate PATCH catches up the picked customer.

  async function pickCustomer(pick: CustomerPick) {
    setCustomer(pick);
    setCustomerPickerOpen(false);
    setCustomerQuery("");
    if (!serverBill) return;
    let customerId: string;
    if (pick.kind === "walk-in") {
      // Resolve the seeded walk-in id by reading from the bill (which
      // carries it on creation) rather than a separate fetch.
      customerId = serverBill.customerIsWalkIn
        ? serverBill.customerId
        : await getWalkInIdFromServer();
    } else {
      customerId = pick.id;
    }
    await callBillEndpoint("Update customer", () =>
      fetch(`/api/accounting/pos/bills/${serverBill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({ customerId }),
      }),
    );
  }

  // Lazy lookup of the seeded walk-in customerId — first call queries
  // /clients/options?includeWalkIn=true and caches.
  const walkInIdRef = useRef<string | null>(null);
  async function getWalkInIdFromServer(): Promise<string> {
    if (walkInIdRef.current) return walkInIdRef.current;
    const r = await fetch(
      "/api/accounting/clients/options?includeWalkIn=true&q=Walk-in&take=5",
      { headers: { "x-portal": "ACCOUNTING" } },
    );
    const j = (await r.json()) as { success: boolean; data: { items: ClientOption[] } | null };
    const id = j.data?.items?.find((c) => /walk-in/i.test(c.name))?.id ?? "";
    walkInIdRef.current = id;
    return id;
  }

  // Sync local customer pick with the server bill's customer record.
  // Runs whenever serverBill changes — so a hold/resume that loaded
  // a bill from the server reflects the bill's customer in the UI.
  useEffect(() => {
    if (!serverBill) return;
    if (serverBill.customerIsWalkIn) {
      setCustomer(WALK_IN);
    } else {
      setCustomer({
        kind: "registered",
        id: serverBill.customerId,
        name: serverBill.customerName,
        mobile: "",
      });
    }
  }, [serverBill?.customerId, serverBill?.customerIsWalkIn]);

  // ─── Render ────────────────────────────────────────────────────────────

  const customerLabel =
    customer.kind === "walk-in"
      ? "Walk-in customer"
      : customer.name;
  const customerSubLabel =
    customer.kind === "walk-in" ? "No customer profile attached" : customer.mobile;

  return (
    <main className="min-h-screen bg-[#f3efe9] text-[#2c2a2c]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,113,1,0.14),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(44,42,44,0.08),_transparent_20%),linear-gradient(180deg,#fffdf9_0%,#f3efe9_100%)]" />
      <div className="relative flex min-h-screen flex-col">
        {/* Header */}
        <header className="border-b border-[#e9dfd5] bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link
                href="/accounting/admin"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ebddd1] bg-[#fff7ef] text-[#2c2a2c]"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ff7101]">
                  POS Counter
                </p>
                <h1 className="text-2xl font-semibold tracking-[-0.05em] text-[#2c2a2c]">
                  Fast billing workspace
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Branch chip / picker */}
              {viewerLoading ? (
                <div className="rounded-full border border-[#e9ddd1] bg-[#fff9f3] px-4 py-2 text-sm text-[#6f6660]">
                  <Loader2 className="inline-block h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : isSuperAdmin ? (
                <>
                  <button
                    ref={branchPickerTriggerRef}
                    type="button"
                    onClick={() => setBranchPickerOpen((v) => !v)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      effectiveBranch
                        ? "border-[#e9ddd1] bg-[#fff9f3] text-[#5e5550]"
                        : "border-[#ffcfaa] bg-[#fff5ec] text-[#b45b12]"
                    }`}
                  >
                    Branch:{" "}
                    <span className="font-semibold">
                      {effectiveBranch ? `${effectiveBranch.code}` : "Pick branch"}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition ${branchPickerOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {branchPickerOpen && branchPickerPanelStyle && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          ref={branchPickerPanelRef}
                          className="fixed z-[120] overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.12)]"
                          style={{
                            left: branchPickerPanelStyle.left,
                            top: branchPickerPanelStyle.top,
                            width: branchPickerPanelStyle.width,
                          }}
                        >
                          <div className="border-b border-[#f0e5dc] px-4 py-3">
                            <p className="text-sm font-semibold text-[#1f1d1c]">Pick a branch</p>
                            <p className="mt-0.5 text-xs text-[#7c6f65]">
                              POS will sell stock from the picked branch only.
                            </p>
                          </div>
                          <div className="grid gap-1 p-2">
                            {branches.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-[#8b7f75]">
                                No active branches.
                              </div>
                            ) : (
                              branches.map((b) => {
                                const isPicked = b.id === effectiveStoreId;
                                return (
                                  <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => {
                                      if (b.id !== effectiveStoreId) {
                                        // Switching branches — drop any active
                                        // server bill from local state. The
                                        // server-side bill row stays put at
                                        // the previous branch (a held bill on
                                        // the prior branch); the load effect
                                        // will refetch the new branch's draft.
                                        setPickedStoreId(b.id);
                                        setServerBill(null);
                                      }
                                      setBranchPickerOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                                      isPicked ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                                    }`}
                                  >
                                    <span>
                                      <span className="font-medium">{b.name}</span>{" "}
                                      <span className="text-xs text-[#8b7f75]">({b.code})</span>
                                    </span>
                                    {isPicked ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                </>
              ) : effectiveBranch ? (
                <div className="rounded-full border border-[#e9ddd1] bg-[#fff9f3] px-4 py-2 text-sm text-[#6f6660]">
                  Branch: <span className="font-semibold">{effectiveBranch.code}</span>
                </div>
              ) : null}

              {/* Cash & Cash Equivalents picker — persisted across reloads */}
              <button
                ref={cashAccountTriggerRef}
                type="button"
                onClick={() => {
                  if (cashAccounts.length > 0) setCashAccountPickerOpen((v) => !v);
                }}
                disabled={cashAccounts.length === 0}
                className={`inline-flex max-w-[260px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedCashAccount
                    ? "border-[#e9ddd1] bg-[#fff9f3] text-[#5e5550]"
                    : "border-[#ffcfaa] bg-[#fff5ec] text-[#b45b12]"
                }`}
              >
                <Coins className="h-3.5 w-3.5 shrink-0 text-[#ff7101]" />
                <span className="truncate">
                  {selectedCashAccount
                    ? selectedCashAccount.label
                    : cashAccounts.length === 0
                      ? "No cash accounts"
                      : "Pick cash account"}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition ${cashAccountPickerOpen ? "rotate-180" : ""}`}
                />
              </button>
              {cashAccountPickerOpen && cashAccounts.length > 0 && cashAccountPanelStyle && typeof document !== "undefined"
                ? createPortal(
                    <div
                      ref={cashAccountPanelRef}
                      className="fixed z-[120] overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.12)]"
                      style={{
                        left: cashAccountPanelStyle.left,
                        top: cashAccountPanelStyle.top,
                        width: cashAccountPanelStyle.width,
                      }}
                    >
                      <div className="border-b border-[#f0e5dc] px-4 py-3">
                        <p className="text-sm font-semibold text-[#1f1d1c]">Cash & cash equivalents</p>
                        <p className="mt-0.5 text-xs text-[#7c6f65]">
                          Selection is remembered until you change it.
                        </p>
                      </div>
                      <div className="grid max-h-72 gap-1 overflow-y-auto p-2">
                        {cashAccounts.map((account) => {
                          const isPicked = account.id === selectedCashAccountId;
                          return (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => {
                                setSelectedCashAccountId(account.id);
                                setCashAccountPickerOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                                isPicked
                                  ? "bg-[#fff1e2] text-[#a95915]"
                                  : "text-[#5c534d] hover:bg-[#fff8f0]"
                              }`}
                            >
                              <span className="truncate text-sm font-medium">{account.label}</span>
                              {isPicked ? (
                                <Check className="ml-2 h-4 w-4 shrink-0 text-[#ff7101]" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}

              {/* Cashier chip */}
              <div className="rounded-full border border-[#e9ddd1] bg-white px-4 py-2 text-sm text-[#6f6660]">
                Cashier: {viewer ? <ViewerName viewer={viewer} /> : "—"}
              </div>

              {/* Hold Bills */}
              <button
                ref={holdTriggerRef}
                type="button"
                onClick={() => setHoldBillsOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-[#e9ddd1] bg-white px-4 py-2 text-sm font-medium text-[#5e5550] shadow-[0_8px_18px_rgba(44,42,44,0.05)] transition hover:border-[#ffcfad]"
              >
                Load Hold Bill
                <ChevronDown
                  className={`h-4 w-4 transition ${holdBillsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {/* History — opens a full bill-history modal with
                   search, payment-method filter, pagination, view +
                   reprint actions. */}
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[#e9ddd1] bg-white px-4 py-2 text-sm font-medium text-[#5e5550] shadow-[0_8px_18px_rgba(44,42,44,0.05)] transition hover:border-[#ffcfad]"
              >
                History
              </button>

              {holdBillsOpen && holdPanelStyle && typeof document !== "undefined"
                ? createPortal(
                    <div
                      ref={holdPanelRef}
                      className="fixed z-[120] overflow-hidden rounded-[22px] border border-[#eadfd5] bg-white shadow-[0_20px_48px_rgba(44,42,44,0.14)]"
                      style={{
                        left: holdPanelStyle.left,
                        top: holdPanelStyle.top,
                        width: holdPanelStyle.width,
                      }}
                    >
                      <div className="border-b border-[#f1e6dc] bg-[#fff8f2] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff7101]">
                          Held Bills
                        </p>
                        <p className="mt-1 text-sm text-[#746b64]">Reopen a paused POS bill.</p>
                      </div>
                      <div className="grid gap-2 p-3">
                        {heldBills.length === 0 ? (
                          <p className="rounded-[18px] bg-[#fcfaf7] px-4 py-6 text-center text-xs text-[#7b716a]">
                            No held bills.
                          </p>
                        ) : (
                          heldBills.map((h) => (
                            <div
                              key={h.id}
                              className="rounded-[18px] border border-[#f0e4d8] bg-[#fffdf9] px-3 py-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#1f1d1c]">{h.billNo}</span>
                                <span className="tabular-nums text-[#766b63]">
                                  {formatMoney(Number(h.total))}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-[#8b7f75]">
                                {h.customerName} · {h.lineCount} line{h.lineCount === 1 ? "" : "s"}
                              </p>
                              {h.heldNote ? (
                                <p className="mt-1 truncate italic text-[#a09388]">{h.heldNote}</p>
                              ) : null}
                              <div className="mt-2 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void deleteHeldBill(h.id)}
                                  className="rounded-lg border border-[#f1cfc1] bg-[#fff7f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b94f37] hover:bg-[#ffece2]"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void resumeHeldBill(h.id)}
                                  className="rounded-lg bg-[#ff7a12] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#ea6a08]"
                                >
                                  Resume
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </div>
        </header>

        {/* Body */}
        {viewerError ? (
          <div className="mx-auto mt-12 w-full max-w-md rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-6 py-8 text-center text-sm text-[#b94f37]">
            {viewerError}
          </div>
        ) : isSuperAdmin && !effectiveStoreId ? (
          <BranchGate
            onPickClick={() => setBranchPickerOpen(true)}
            branchCount={branches.length}
          />
        ) : (
          <div className="mx-auto grid w-full max-w-[1800px] flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_500px]">
            {/* Products section */}
            <section className="min-w-0 rounded-[30px] border border-[#eadfd5] bg-white p-5 shadow-[0_16px_48px_rgba(44,42,44,0.05)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9a8e85]" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-14 w-full rounded-[20px] border border-[#efe3d8] bg-[#fffaf5] pl-12 pr-4 text-sm outline-none transition focus:border-[#ff7101]"
                    placeholder="Search by product, code, or barcode"
                    autoFocus
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-[#eaded2] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5d5550]"
                  >
                    <PackageSearch className="h-4 w-4 text-[#ff7101]" />
                    Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductsRefreshNonce((n) => n + 1)}
                    disabled={productsLoading}
                    title="Refresh stock list"
                    className="inline-flex items-center gap-2 rounded-full border border-[#eaded2] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5d5550] transition hover:border-[#ffcfad] hover:bg-[#fff5ec] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-[#ff7101] ${productsLoading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                </div>
              </div>

              {productsError ? (
                <div className="mt-5 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {productsError}
                </div>
              ) : null}

              {productsLoading ? (
                <div className="mt-10 flex items-center justify-center gap-3 text-sm text-[#7f756f]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                  Loading products…
                </div>
              ) : products.length === 0 ? (
                <div className="mt-10 rounded-3xl border border-dashed border-[#e0d5cc] bg-[#fffaf5] py-12 text-center text-sm text-[#9b7a61]">
                  {searchTerm
                    ? `No products match "${searchTerm}" at this branch.`
                    : "No products with stock at this branch yet."}
                </div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {products.map((product) => {
                    const inCart = cart.find((line) => line.productId === product.id);
                    const branchQty = Number(product.branchQtyOnHand);
                    const isVoucher = product.itemType === "VOUCHER";
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className={`rounded-[20px] border p-3.5 text-left transition hover:-translate-y-0.5 ${
                          inCart
                            ? "border-[#ffcfad] bg-[linear-gradient(160deg,#fff5ec_0%,#fffaf5_100%)] shadow-[0_18px_50px_rgba(255,113,1,0.12)]"
                            : "border-[#efe3d8] bg-[#fffdfb] hover:border-[#ffd6b8]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a08879]">
                              {product.code}
                            </p>
                            {isVoucher ? (
                              <span className="mt-1 inline-block rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
                                Voucher
                              </span>
                            ) : null}
                            <h2 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-tight text-[#2c2a2c]">
                              {product.name}
                            </h2>
                          </div>
                          <div className="shrink-0 rounded-full bg-[#2c2a2c] p-1.5 text-white">
                            <ShoppingBasket className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#ff7101]">
                          {formatMoney(Number(product.salesPrice))}
                        </p>
                        <p className="mt-0.5 text-xs text-[#7f756f]">
                          {branchQty} {product.uomBase} in stock
                        </p>
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#ff7101] px-3 py-1.5 text-xs font-semibold text-white">
                          {inCart ? "Add another" : "Add to bill"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Bill aside */}
            <aside className="rounded-[30px] border border-[#eadfd5] bg-[#2c2a2c] p-5 text-white shadow-[0_16px_48px_rgba(44,42,44,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffb37c]">
                    Current bill
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
                    {serverBill?.billNo ?? billNumber}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                  {cart.length} {cart.length === 1 ? "item" : "items"}
                </div>
              </div>

              {/* Customer */}
              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4" ref={customerWrapperRef}>
                <p className="text-sm font-medium text-white/80">Customer</p>
                <button
                  type="button"
                  onClick={() => setCustomerPickerOpen((v) => !v)}
                  className="mt-3 flex w-full items-center justify-between rounded-[18px] bg-black/20 px-4 py-3 text-left text-sm text-white transition hover:bg-black/30"
                >
                  <span className="flex flex-col text-left">
                    <span className="font-semibold">{customerLabel}</span>
                    <span className="text-xs text-white/60">{customerSubLabel}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/60 transition ${customerPickerOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {customerPickerOpen ? (
                  <div className="mt-2 overflow-hidden rounded-[18px] border border-white/10 bg-[#1f1d1c]">
                    <div className="border-b border-white/10 p-3">
                      <div className="flex items-center gap-2">
                        <label className="relative block flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                          <input
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            placeholder="Search customers"
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#ff7101]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setCustomerQuickOpen(true)}
                          title="Add new customer"
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#ff8e42]/30 bg-[#ff7101] px-3 text-xs font-semibold text-white transition hover:bg-[#ff8a2c]"
                        >
                          <Plus className="h-4 w-4" />
                          Add
                        </button>
                      </div>
                    </div>
                    <div
                      ref={customerListRef}
                      onScroll={handleCustomerScroll}
                      className="max-h-72 overflow-y-auto p-2"
                    >
                      {/* Walk-in pin at top */}
                      <button
                        type="button"
                        onClick={() => void pickCustomer(WALK_IN)}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                          customer.kind === "walk-in"
                            ? "bg-[#3a2418] text-[#ffb37c]"
                            : "text-white/80 hover:bg-white/5"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">Walk-in customer</span>
                          <span className="block text-xs text-white/50">
                            Default — no customer profile attached.
                          </span>
                        </span>
                        {customer.kind === "walk-in" ? (
                          <Check className="mt-0.5 h-4 w-4" />
                        ) : null}
                      </button>
                      {customerOptions.map((opt) => {
                        const isPicked =
                          customer.kind === "registered" && customer.id === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              void pickCustomer({
                                kind: "registered",
                                id: opt.id,
                                name: opt.name,
                                mobile: opt.contact,
                              })
                            }
                            className={`mt-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                              isPicked
                                ? "bg-[#3a2418] text-[#ffb37c]"
                                : "text-white/80 hover:bg-white/5"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {opt.name}
                              </span>
                              <span className="block truncate text-xs text-white/50">
                                {[opt.contact, opt.city].filter((p) => p.trim()).join(" · ") ||
                                  "No contact"}
                              </span>
                            </span>
                            {isPicked ? <Check className="mt-0.5 h-4 w-4" /> : null}
                          </button>
                        );
                      })}
                      {customerLoading ? (
                        <div className="px-3 py-3 text-center text-xs text-white/40">
                          Loading…
                        </div>
                      ) : customerOptions.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-white/40">
                          No customers found.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Cart lines */}
              <div className="mt-5 space-y-3">
                {cart.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-white/50">
                    No items added yet. Tap a product card to add it to the bill.
                  </div>
                ) : (
                  cart.map((line) => {
                    const qtyNum = Number(line.qty) || 0;
                    const discNum = Number(line.discount) || 0;
                    const lineTotal = Math.max(0, qtyNum * line.unitPrice - discNum);
                    return (
                      <div
                        key={line.id}
                        className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{line.name}</p>
                            <p className="mt-0.5 text-xs text-white/60">
                              {line.code} · {formatMoney(line.unitPrice)} / {line.uomBase}
                            </p>
                            {line.serialNumber ? (
                              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#ffb37c]/40 bg-[#ff7101]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#ffb37c]">
                                Serial: {line.serialNumber}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCartLine(line.id)}
                            aria-label={`Remove ${line.code}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/60 transition hover:border-rose-300 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          {line.serialNumber ? (
                            <p className="text-xs text-white/50">
                              Qty 1 · serial-tracked
                            </p>
                          ) : (
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2.5 py-1.5 text-white">
                              <button
                                type="button"
                                onClick={() => adjustQty(line.id, -1)}
                                className="text-white/70 transition hover:text-white"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                inputMode="decimal"
                                value={line.qty}
                                onChange={(event) =>
                                  updateCartLine(line.id, { qty: sanitizeDecimal(event.target.value) })
                                }
                                className="w-10 bg-transparent text-center text-sm font-semibold outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => adjustQty(line.id, +1)}
                                className="text-[#ffb37c] transition hover:text-[#ffc796]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          <p className="text-base font-semibold text-[#ffb37c] tabular-nums">
                            {formatMoney(lineTotal)}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60">
                          <span>Line discount</span>
                          <LineDiscountInput
                            value={line.discount}
                            onCommit={(next) =>
                              updateCartLine(line.id, { discount: next })
                            }
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Totals */}
              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-white/70">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                  <span>Discount (sum of lines)</span>
                  <span className="tabular-nums">{formatMoney(totals.totalDiscount)}</span>
                </div>
                <div className="mt-4 h-px bg-white/10" />
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm uppercase tracking-[0.24em] text-[#ffb37c]">
                    Total due
                  </span>
                  <span className="text-3xl font-semibold tracking-[-0.04em] text-white tabular-nums">
                    {formatMoney(totals.totalDue)}
                  </span>
                </div>
              </div>

              {/* Cashier reckoning helper — front-end ONLY. Lets the
                   cashier punch in what the customer handed over and
                   instantly see the change to give back (or how much
                   more is short). The value is never sent to the
                   server; the actual posting always uses totals.totalDue. */}
              {(() => {
                const due = totals.totalDue;
                const givenNum = Number.parseFloat(cashGivenInput);
                const hasInput =
                  cashGivenInput.trim().length > 0 && Number.isFinite(givenNum);
                const diff = hasInput ? givenNum - due : 0;
                const showChange = hasInput && diff >= 0;
                const showShort = hasInput && diff < 0;
                return (
                  <div className="mt-5 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                        Cash given
                      </p>
                      {showChange ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8be58b]">
                          Change to give
                        </span>
                      ) : showShort ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ffb37c]">
                          Still due
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={cashGivenInput}
                        onChange={(e) => setCashGivenInput(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-right text-base font-semibold tabular-nums text-white outline-none placeholder:text-white/30 focus:border-[#ff8e42]/60"
                      />
                      <span
                        className={`min-w-[110px] rounded-[12px] border px-3 py-2 text-right text-base font-semibold tabular-nums ${
                          showChange
                            ? "border-[#8be58b]/30 bg-[#8be58b]/10 text-[#8be58b]"
                            : showShort
                              ? "border-[#ffb37c]/30 bg-[#ffb37c]/10 text-[#ffb37c]"
                              : "border-white/10 bg-white/5 text-white/40"
                        }`}
                      >
                        {hasInput
                          ? formatMoney(Math.abs(diff))
                          : formatMoney(0)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Apply Voucher (per theory § 7.4) — sits above the
                   tender picker so the cashier can scan/type a voucher
                   serial first and then pick a method for the
                   remaining balance. */}
              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  Apply Voucher
                </p>
                {appliedVoucher ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {appliedVoucher.serialNumber}
                      </span>
                      <span className="block truncate text-[11px] text-white/55">
                        {appliedVoucher.productName} · LKR{" "}
                        {appliedVoucher.faceValue.toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearAppliedVoucher}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 hover:bg-white/10"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={voucherSerialInput}
                      onChange={(e) => setVoucherSerialInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyVoucher();
                        }
                      }}
                      placeholder="Scan or type voucher serial"
                      className="flex-1 rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff8e42]/60"
                    />
                    <button
                      type="button"
                      onClick={() => void applyVoucher()}
                      disabled={!voucherSerialInput.trim() || voucherLookupBusy}
                      className="rounded-[12px] border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {voucherLookupBusy ? "…" : "Apply"}
                    </button>
                  </div>
                )}
              </div>

              {/* Payment method picker — 4 options per § 5.4 */}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {(["CASH", "CARD", "MIXED", "SPLIT"] as const).map((method) => {
                  const active = paymentMethod === method;
                  const Icon =
                    method === "CASH" ? Wallet :
                    method === "CARD" ? CreditCard :
                    method === "MIXED" ? Coins :
                    BadgeDollarSign;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => pickPaymentMethod(method)}
                      className={`rounded-[18px] px-4 py-4 text-sm font-semibold transition ${
                        active
                          ? "border border-[#ff8e42]/30 bg-[#ff7101] text-white"
                          : "border border-white/10 bg-white/5 text-white"
                      }`}
                    >
                      <Icon className="mx-auto mb-2 h-5 w-5" />
                      {method === "CASH" ? "Cash" : method === "CARD" ? "Card" : method === "MIXED" ? "Mixed" : "Split"}
                    </button>
                  );
                })}
              </div>

              {/* MIXED panel — single column stack so the inputs and
                   dropdowns can't overflow the bill panel width.
                   Custom dropdown styled like the rest of the dark
                   theme; native <select> overflowed at the panel edge.
                   Per § 5.4 / § 8.6. */}
              {paymentMethod === "MIXED" ? (
                <div className="mt-4 grid gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                    Mixed payment — split across two cash accounts
                  </p>

                  {/* Account A row */}
                  <div className="grid gap-1">
                    <span className="truncate text-[11px] text-white/55">
                      Account A:{" "}
                      <span className="text-white/80">
                        {selectedCashAccount?.label ?? "Pick in header"}
                      </span>
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mixedPrimaryAmount}
                      onChange={(e) => setMixedPrimaryAmount(sanitizeDecimal(e.target.value))}
                      className="w-full rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-right tabular-nums text-white outline-none focus:border-[#ff8e42]/60"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Account B row */}
                  <div className="grid gap-1">
                    <span className="text-[11px] text-white/55">Account B</span>
                    <MixedAccountBPicker
                      cashAccounts={cashAccounts}
                      excludeId={selectedCashAccountId}
                      value={mixedSecondaryAccountId}
                      onChange={setMixedSecondaryAccountId}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mixedSecondaryAmount}
                      onChange={(e) => setMixedSecondaryAmount(sanitizeDecimal(e.target.value))}
                      className="w-full rounded-[12px] border border-white/10 bg-[#1f1818] px-3 py-2 text-right tabular-nums text-white outline-none focus:border-[#ff8e42]/60"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Sum readout */}
                  {(() => {
                    const sum = Number(mixedPrimaryAmount || 0) + Number(mixedSecondaryAmount || 0);
                    const ok = Math.abs(sum - totals.totalDue) <= 0.01;
                    return (
                      <p className="flex items-center justify-between text-[11px] text-white/50">
                        <span>Sum vs. total due</span>
                        <span className={`tabular-nums ${ok ? "text-emerald-400" : "text-amber-400"}`}>
                          {sum.toFixed(2)} / {totals.totalDue.toFixed(2)}
                        </span>
                      </p>
                    );
                  })()}
                </div>
              ) : null}

              {/* SPLIT panel — merchant picker. Customer-must-be-real
                   guard already runs at method-pick time (§ 3.6). */}
              {paymentMethod === "SPLIT" ? (
                <div className="mt-4 grid gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                    Split — merchant settles later
                  </p>
                  <SplitMerchantPicker
                    merchants={splitMerchants}
                    value={splitMerchantId}
                    onChange={setSplitMerchantId}
                  />
                  <p className="text-[11px] text-white/50">
                    End-customer:{" "}
                    <span className="font-semibold text-white/80">
                      {customer.kind === "registered"
                        ? customer.name
                        : "⚠ Pick a registered customer above first"}
                    </span>
                  </p>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  disabled={cart.length === 0 || payInFlight}
                  onClick={() => void completeBill()}
                  className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-white px-5 py-4 text-sm font-semibold text-[#2c2a2c] transition hover:bg-[#fff5ec] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Receipt className="h-4 w-4 text-[#ff7101]" />
                  {payInFlight ? "Processing…" : "Complete bill and print"}
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => void holdCurrentBill()}
                  className="rounded-[20px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Hold bill
                </button>
                {cart.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void clearCart()}
                    className="text-xs text-white/40 underline-offset-2 hover:text-white/60 hover:underline"
                  >
                    Clear cart
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* POS Bill History modal — search + filter + paginated table
          with View (summary popup) and Reprint (opens receipt route). */}
      {historyOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fffdfa] shadow-[0_30px_80px_rgba(31,29,28,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#efe4db] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                  POS / History
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#1f1d1c]">
                  Bill History — {effectiveBranch?.code ?? "—"}
                </h2>
                <p className="mt-1 text-sm text-[#786f69]">
                  Search and re-print any completed POS bill at this branch.
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistory}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] hover:border-[#ffba82]"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-[#efe4db] bg-[#fffaf5] px-5 py-3">
              <label className="relative block flex-1 min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                <input
                  type="text"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Search by bill number or customer name"
                  className="h-10 w-full rounded-2xl border border-[#eadfd5] bg-white pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                />
              </label>
              <div className="flex items-center gap-1 rounded-2xl border border-[#eadfd5] bg-white p-1">
                {(["", "CASH", "CARD", "MIXED", "SPLIT"] as const).map((m) => {
                  const label = m === "" ? "All" : m === "CASH" ? "Cash" : m === "CARD" ? "Card" : m === "MIXED" ? "Mixed" : "Split";
                  const active = historyMethodFilter === m;
                  return (
                    <button
                      key={m || "all"}
                      type="button"
                      onClick={() => setHistoryMethodFilter(m)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[#ff7a12] text-white"
                          : "text-[#5f5751] hover:bg-[#fff7f0]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-[1] bg-[#faf6f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b7e72]">
                  <tr>
                    <th className="px-5 py-3 text-left">Bill no</th>
                    <th className="px-5 py-3 text-left">Date / time</th>
                    <th className="px-5 py-3 text-left">Customer</th>
                    <th className="px-5 py-3 text-left">Method</th>
                    <th className="px-5 py-3 text-right">Items</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-[#7b736d]">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                          Loading…
                        </span>
                      </td>
                    </tr>
                  ) : historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-[#7b736d]">
                        No completed bills match this filter.
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((item) => (
                      <tr key={item.id} className="border-t border-[#efe4db] hover:bg-[#fffaf5]">
                        <td className="px-5 py-3 font-mono text-[13px] text-[#1f1d1c]">
                          {item.billNo}
                        </td>
                        <td className="px-5 py-3 text-[#5f5751]">
                          {item.postedAt
                            ? new Date(item.postedAt).toLocaleString("en-GB", {
                                timeZone: "Asia/Colombo",
                                year: "numeric",
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-[#5f5751]">
                          {item.paymentMethod === "SPLIT" && item.merchantName
                            ? `${item.customerName} → ${item.merchantName}`
                            : item.customerName}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                              item.paymentMethod === "CASH"
                                ? "bg-[#fff1e2] text-[#a95915]"
                                : item.paymentMethod === "CARD"
                                  ? "bg-[#e6f0ff] text-[#1d4d99]"
                                  : item.paymentMethod === "MIXED"
                                    ? "bg-[#f0e4ff] text-[#5b3eaf]"
                                    : "bg-[#e2f5e6] text-[#1f7a3d]"
                            }`}
                          >
                            {item.paymentMethod}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-[#5f5751]">
                          {item.itemCount}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold text-[#1f1d1c]">
                          {formatMoney(Number(item.total))}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openHistoryView(item.id)}
                              className="rounded-lg border border-[#e2d8cf] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5f5751] hover:border-[#ffd6b8]"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => reprintBill(item.id)}
                              className="rounded-lg bg-[#ff7a12] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#ea6a08]"
                            >
                              Print
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#efe4db] bg-[#fffaf5] px-5 py-3 text-xs text-[#7b736d]">
              <span>
                Showing{" "}
                {historyTotal === 0
                  ? 0
                  : historyPage * HISTORY_PAGE_SIZE + 1}
                –
                {Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, historyTotal)} of{" "}
                {historyTotal}
              </span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  disabled={historyPage === 0 || historyLoading}
                  className="rounded-lg border border-[#e2d8cf] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f5751] hover:border-[#ffd6b8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  Page {historyPage + 1} of{" "}
                  {Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={
                    historyLoading ||
                    (historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal
                  }
                  className="rounded-lg border border-[#e2d8cf] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f5751] hover:border-[#ffd6b8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* History → View bill summary popup */}
      {historyViewBill || historyViewLoading ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/55 px-4 py-6">
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-[#e9dfd5] bg-white shadow-[0_24px_60px_rgba(31,29,28,0.32)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#efe4db] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                  POS Bill Summary
                </p>
                <h2 className="mt-1 truncate font-mono text-lg font-semibold text-[#1f1d1c]">
                  {historyViewBill?.billNo ?? "Loading…"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeHistoryView}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] hover:border-[#ffba82]"
                aria-label="Close summary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {historyViewLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#7b736d]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                  Loading bill…
                </div>
              ) : historyViewBill ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#efe4db] bg-[#fffaf5] p-3 text-xs">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                        Posted
                      </p>
                      <p className="mt-0.5 text-sm text-[#1f1d1c]">
                        {historyViewBill.postedAt
                          ? new Date(historyViewBill.postedAt).toLocaleString("en-GB", {
                              timeZone: "Asia/Colombo",
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                        Cashier
                      </p>
                      <p className="mt-0.5 text-sm text-[#1f1d1c]">
                        {historyViewBill.cashierName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                        Customer
                      </p>
                      <p className="mt-0.5 text-sm text-[#1f1d1c]">
                        {historyViewBill.customerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                        Method
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                        {historyViewBill.paymentMethod ?? "—"}
                      </p>
                    </div>
                    {historyViewBill.merchantName ? (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                          Merchant
                        </p>
                        <p className="mt-0.5 text-sm text-[#1f1d1c]">
                          {historyViewBill.merchantName}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-[#efe4db]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#fffaf5] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyViewBill.lines.map((line) => (
                          <tr key={line.id} className="border-t border-[#efe4db]">
                            <td className="px-3 py-2 text-[#1f1d1c]">
                              <p className="font-medium">{line.productName}</p>
                              <p className="text-[10px] text-[#a09388]">
                                {line.productCode}
                                {line.voucherSerialId ? " · voucher" : ""}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#5f5751]">
                              {line.qty}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#5f5751]">
                              {formatMoney(Number(line.unitPrice))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#1f1d1c]">
                              {formatMoney(Number(line.lineTotal))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-1 rounded-2xl border border-[#efe4db] bg-[#fffaf5] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[#5f5751]">Subtotal</span>
                      <span className="tabular-nums">
                        {formatMoney(Number(historyViewBill.subtotal))}
                      </span>
                    </div>
                    {Number(historyViewBill.totalDiscount) > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[#5f5751]">Discount</span>
                        <span className="tabular-nums">
                          − {formatMoney(Number(historyViewBill.totalDiscount))}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-[#efe4db] pt-1">
                      <span className="font-semibold">Total</span>
                      <span className="text-base font-semibold tabular-nums text-[#a04d09]">
                        {formatMoney(Number(historyViewBill.total))}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#efe4db] bg-white p-3 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7f75]">
                      Tender
                    </p>
                    <ul className="mt-1 grid gap-1">
                      {historyViewBill.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between">
                          <span className="text-[#5f5751]">
                            {p.method === "CASH" || p.method === "CARD"
                              ? `${p.method} · ${p.cashAccountLabel ?? ""}`
                              : p.method === "SPLIT"
                                ? `Merchant · ${p.merchantName ?? ""}`
                                : p.method === "REDEEM_VOUCHER"
                                  ? `Voucher · ${p.voucherSerialNumber ?? ""}`
                                  : p.method}
                          </span>
                          <span className="tabular-nums">
                            {formatMoney(Number(p.amount))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeHistoryView}
                      className="rounded-xl border border-[#e2d8cf] bg-white px-4 py-2 text-sm font-semibold text-[#5f5751] hover:bg-[#fff7f0]"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => historyViewBill && reprintBill(historyViewBill.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea6a08]"
                    >
                      <Receipt className="h-4 w-4" />
                      Reprint receipt
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Voucher serial picker dialog — opened when cashier clicks
          "Add to bill" on a voucher product. Lists ACTIVE serials at
          the branch; on pick, fires add-line with the chosen serial.
          Per accounting-theories.md § 7.3 — vouchers are sold by
          specific serial. */}
      {voucherPickerOpen && voucherPickerProduct ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[24px] border border-[#e9dfd5] bg-white p-5 shadow-[0_24px_60px_rgba(31,29,28,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a08879]">
                  {voucherPickerProduct.code}
                </p>
                <p className="mt-1 truncate font-sans text-lg font-semibold text-[#1f1d1c]">
                  {voucherPickerProduct.name}
                </p>
                <p className="mt-1 text-xs text-[#7a716a]">
                  Pick the voucher serial number to sell.
                </p>
              </div>
              <button
                type="button"
                onClick={closeVoucherSerialPicker}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece2d6] bg-[#fffaf5] text-[#6d655e] hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-[#f0e7dc] bg-[#fffdf9] p-2">
              {voucherSerialsLoading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[#7a716a]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                  Loading serials…
                </div>
              ) : voucherSerialOptions.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[#a09388]">
                  No active voucher serials at this branch. (All sold or
                  reserved.)
                </p>
              ) : (
                <ul className="grid gap-1">
                  {voucherSerialOptions.map((s) => (
                    <li key={s.serialId}>
                      <button
                        type="button"
                        onClick={() => void pickVoucherSerial(s.serialId)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-[#1f1d1c] transition hover:border-[#ffd6b8] hover:bg-[#fff5ec]"
                      >
                        <span className="truncate font-mono text-[13px]">
                          {s.serialNumber}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[#a04d09]">
                          LKR {s.faceValue}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Product serial picker dialog — opened for inventory items with
          serialTrackingEnabled = true. Same shape as the voucher picker
          above, sells one serial per line. */}
      {productSerialPickerOpen && productSerialPickerProduct ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[24px] border border-[#e9dfd5] bg-white p-5 shadow-[0_24px_60px_rgba(31,29,28,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a08879]">
                  {productSerialPickerProduct.code}
                </p>
                <p className="mt-1 truncate font-sans text-lg font-semibold text-[#1f1d1c]">
                  {productSerialPickerProduct.name}
                </p>
                <p className="mt-1 text-xs text-[#7a716a]">
                  Pick the serial number being sold.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductSerialPicker}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece2d6] bg-[#fffaf5] text-[#6d655e] hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-[#f0e7dc] bg-[#fffdf9] p-2">
              {productSerialsLoading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[#7a716a]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                  Loading serials…
                </div>
              ) : productSerialOptions.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[#a09388]">
                  No active serials at this branch. (All sold or
                  reserved.)
                </p>
              ) : (
                <ul className="grid gap-1">
                  {productSerialOptions.map((s) => (
                    <li key={s.serialId}>
                      <button
                        type="button"
                        onClick={() => void pickProductSerial(s.serialId)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-[#1f1d1c] transition hover:border-[#ffd6b8] hover:bg-[#fff5ec]"
                      >
                        <span className="truncate font-mono text-[13px]">
                          {s.serialNumber}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-[#2c2a2c]/10 bg-[#2c2a2c] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_38px_rgba(31,29,28,0.24)]">
          <span className="inline-flex items-center gap-2">
            {toast}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ) : null}

      {/* Quick-add customer popup — opened from the customer picker
          "+ Add" button. On success we auto-select the new customer
          on the current bill via the same pickCustomer flow that the
          dropdown rows use. */}
      <CustomerQuickCreateModal
        open={customerQuickOpen}
        onClose={() => setCustomerQuickOpen(false)}
        defaultName={customerQuery}
        onCreated={(client) => {
          void pickCustomer({
            kind: "registered",
            id: client.id,
            name: client.name,
            mobile: client.mobile,
          });
          setToast(`Customer "${client.name}" created.`);
        }}
      />
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

// Local-state wrapper around the per-line discount input. Lets the
// cashier type freely (including momentary invalid values mid-keystroke,
// up to and including a discount equal to the line gross — which is a
// legitimate "free gift" line). The PATCH only fires on blur or
// Enter, so server-side decimal formatting doesn't overwrite the input
// while the cashier is still typing.
function LineDiscountInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  // Sync external changes (e.g. server response after blur) only when
  // the field doesn't currently have focus — otherwise we'd clobber
  // the cashier's in-progress typing.
  useEffect(() => {
    if (!focused) setLocal(value);
  }, [value, focused]);
  function commit() {
    if (local !== value) onCommit(local || "0");
  }
  return (
    <input
      inputMode="decimal"
      value={local}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      onChange={(event) => setLocal(sanitizeDecimal(event.target.value))}
      placeholder="0.00"
      className="h-9 w-32 rounded-lg border border-white/10 bg-black/20 px-2 text-right text-sm tabular-nums text-white outline-none placeholder:text-white/30 focus:border-[#ff7101]"
    />
  );
}

function ViewerName({ viewer }: { viewer: NonNullable<ScreenViewer> }) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { headers: { "x-portal": "ACCOUNTING" } })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.success && j.data?.displayName) {
          setDisplayName(j.data.displayName);
        }
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return <span className="font-semibold">{displayName ?? viewer.role}</span>;
}

function BranchGate({
  onPickClick,
  branchCount,
}: {
  onPickClick: () => void;
  branchCount: number;
}) {
  return (
    <div className="mx-auto mt-12 grid w-full max-w-md gap-4 rounded-3xl border border-[#eadfd5] bg-white px-8 py-10 text-center shadow-[0_16px_48px_rgba(44,42,44,0.05)]">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff1e2] text-[#ff7101]">
        <PackageSearch className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1f1d1c]">Pick a branch to start billing</h2>
        <p className="mt-2 text-sm text-[#7c6f65]">
          Products and stock load per branch. Switch branches anytime from the header chip — your cart resets when you do.
        </p>
      </div>
      {branchCount === 0 ? (
        <p className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          No active branches found. Add a branch in Settings → Branches to start using POS.
        </p>
      ) : (
        <button
          type="button"
          onClick={onPickClick}
          className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#ff7101] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Pick a branch
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
