"use client";

// Reusable async picker for the reports filter form. Supports:
//   - branch    (synchronous list — small, loaded once)
//   - customer  (async search via /clients/options)
//   - supplier  (async search via /suppliers/options)
//   - account   (async search via /accounts/options)
//   - product   (async search via /reports/options/products)
//
// Same dropdown UX everywhere: button with the current label, click
// to open a popover with a search input and the result list. When
// `allowAll` is true the popover shows a top "All X" option that
// clears the selection (selected id becomes empty string, surfaced
// to the report endpoint as "ALL"). Required pickers (e.g. Customer
// Statement) set `allowAll={false}` so the report can't be generated
// without a selection.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export type ReportPickerKind = "branch" | "customer" | "supplier" | "account" | "product";

type Option = { id: string; label: string; sublabel?: string };

type Props = {
  kind: ReportPickerKind;
  // The current selection id ("" = ALL when allowAll).
  value: string;
  // Display label cached on the client; falls back to "All X" when value is "".
  displayLabel?: string;
  onChange: (id: string, label: string) => void;
  allowAll?: boolean;
  required?: boolean;
};

const ALL_LABELS: Record<ReportPickerKind, string> = {
  branch: "All branches",
  customer: "All customers",
  supplier: "All suppliers",
  account: "All accounts",
  product: "All products",
};

const PLACEHOLDERS: Record<ReportPickerKind, string> = {
  branch: "Search branches",
  customer: "Search customers",
  supplier: "Search suppliers",
  account: "Search by code or name",
  product: "Search by code or name",
};

export function ReportPicker({
  kind,
  value,
  displayLabel,
  onChange,
  allowAll = true,
  required = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Popover position — recomputed on open + on window resize/scroll
  // so the dropdown always sits flush under the trigger button even
  // when an ancestor has overflow: hidden (which would otherwise
  // clip an absolutely-positioned child).
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Debounce search term so we don't hammer the option endpoint.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Recompute popover rect whenever it opens or the viewport changes.
  // useLayoutEffect so the popover is positioned before paint —
  // avoids the flash of unpositioned dropdown.
  useLayoutEffect(() => {
    if (!open) {
      setPopoverRect(null);
      return;
    }
    function compute() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPopoverRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
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

  // Close on outside click — check BOTH the trigger button and the
  // portal-rendered popover (since the popover is no longer a DOM
  // child of `ref`, the previous .contains() check would miss it
  // and close the dropdown the moment you clicked the search input).
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      const inTrigger = ref.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (kind === "branch") {
        url = "/api/accounting/reports/options/branches";
      } else if (kind === "customer") {
        url = `/api/accounting/clients/options?q=${encodeURIComponent(debouncedTerm)}&take=20`;
      } else if (kind === "supplier") {
        url = `/api/accounting/suppliers/options?q=${encodeURIComponent(debouncedTerm)}&take=20`;
      } else if (kind === "account") {
        // Use the reports-specific accounts endpoint — the shared
        // /accounts/options route requires a category param (it's
        // wired for product forms that always pick inside one
        // category) and returns 400 if you ask without one.
        url = `/api/accounting/reports/options/accounts?q=${encodeURIComponent(debouncedTerm)}&take=20`;
      } else {
        url = `/api/accounting/reports/options/products?q=${encodeURIComponent(debouncedTerm)}&take=20`;
      }
      const r = await fetch(url, { headers: { "x-portal": "ACCOUNTING" } });
      const j = (await r.json()) as { success: boolean; data?: unknown; message?: string };
      if (!j.success) {
        setError(j.message ?? "Failed to load options.");
        setOptions([]);
        return;
      }
      const opts: Option[] = adaptResponse(kind, j.data);
      setOptions(opts);
    } catch {
      setError("Network error.");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [kind, debouncedTerm]);

  // Initial + on-search load while open
  useEffect(() => {
    if (!open) return;
    void fetchOptions();
  }, [open, fetchOptions]);

  const currentLabel = useMemo(() => {
    if (!value) return ALL_LABELS[kind];
    return displayLabel ?? "Selected";
  }, [value, displayLabel, kind]);

  function handleSelect(opt: Option | null) {
    if (opt === null) {
      onChange("", ALL_LABELS[kind]);
    } else {
      onChange(opt.id, opt.label);
    }
    setOpen(false);
    setSearchTerm("");
  }

  const isPlaceholder = !value;
  const showRequiredHint = required && !value;

  // Popover content — rendered into document.body via createPortal
  // so it can break out of any overflow:hidden ancestor (the
  // SurfaceCard wrapping each filter section, for instance). We
  // anchor it under the trigger button by absolute-positioning at the
  // button's getBoundingClientRect() — recomputed on open / scroll /
  // resize.
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
            className="max-h-72 overflow-hidden rounded-2xl border border-[#e2d8cf] bg-white shadow-[0_14px_38px_rgba(27,24,22,0.10)]"
          >
            <div className="relative border-b border-[#f0e8e0] px-3 py-2">
              <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a59889]" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={PLACEHOLDERS[kind]}
                autoFocus
                className="h-8 w-full rounded-lg border border-[#e2d8cf] bg-white pl-7 pr-2 text-xs text-[#1f1d1c] outline-none focus:border-[#ff7a12]"
              />
            </div>

            <div className="max-h-56 overflow-y-auto py-1 text-sm">
              {allowAll ? (
                <PickerRow
                  label={ALL_LABELS[kind]}
                  selected={!value}
                  onClick={() => handleSelect(null)}
                />
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-[#7b736d]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : error ? (
                <div className="px-3 py-3 text-xs text-[#b94f37]">{error}</div>
              ) : options.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#9a8f85]">
                  No matches for &ldquo;{debouncedTerm}&rdquo;.
                </div>
              ) : (
                options.map((opt) => (
                  <PickerRow
                    key={opt.id}
                    label={opt.label}
                    sublabel={opt.sublabel}
                    selected={value === opt.id}
                    onClick={() => handleSelect(opt)}
                  />
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
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm transition focus:outline-none ${
          showRequiredHint
            ? "border-[#e6395a] text-[#e6395a]"
            : isPlaceholder
              ? "border-[#e2d8cf] text-[#7b736d]"
              : "border-[#e2d8cf] text-[#1f1d1c] hover:border-[#ffcfad]"
        }`}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {popover}
    </div>
  );
}

function PickerRow({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-[#fff7f0] ${
        selected ? "bg-[#fff5ec] text-[#bb5c12]" : "text-[#1f1d1c]"
      }`}
    >
      <span className="min-w-0 truncate">
        <span className={selected ? "font-semibold" : ""}>{label}</span>
        {sublabel ? (
          <span className="ml-1.5 text-[11px] text-[#9a8f85]">{sublabel}</span>
        ) : null}
      </span>
      {selected ? <Check className="h-3.5 w-3.5 text-[#ff7a12]" /> : null}
    </button>
  );
}

// ─── Response adapters ─────────────────────────────────────────────────

function adaptResponse(kind: ReportPickerKind, data: unknown): Option[] {
  // Each option endpoint has a slightly different shape — normalise
  // here so the picker UI doesn't need to know.
  if (!data || typeof data !== "object") return [];
  const raw = data as Record<string, unknown>;

  if (kind === "branch") {
    const items = (raw.items as Array<{ id: string; code: string; name: string }>) ?? [];
    return items.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }));
  }

  if (kind === "customer") {
    const items = (raw.items as Array<{ id: string; name: string; contact?: string }>) ?? [];
    return items.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: c.contact ?? "",
    }));
  }

  if (kind === "supplier") {
    const items = (raw.items as Array<{ id: string; code?: string; name: string }>) ?? [];
    return items.map((s) => ({
      id: s.id,
      label: s.code ? `${s.code} · ${s.name}` : s.name,
    }));
  }

  if (kind === "account") {
    const items = (raw.items as Array<{ id: string; code: string; name: string }>) ?? [];
    return items.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }));
  }

  // product
  const items = (raw.items as Array<{ id: string; code: string; name: string }>) ?? [];
  return items.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));
}
