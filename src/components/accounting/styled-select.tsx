"use client";

// Tailwind-styled select — a button that opens a portal-rendered
// dropdown of options. Replacement for the native `<select>` which
// renders inconsistently across browsers and can't be styled to
// match the rest of the UI.
//
// For async / large option lists, use ReportPicker instead. This
// component takes a small fixed `options` array passed in at render
// time, so it's right for things like "Pick expense account from
// the 6 expense accounts we know about" — no search input needed.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type StyledSelectOption = {
  value: string;
  label: string;
  // Optional secondary line, rendered in muted text under the label.
  sublabel?: string;
};

type Props = {
  value: string;
  onChange: (value: string, label: string) => void;
  options: StyledSelectOption[];
  placeholder?: string;
  // When true, show a search box at the top of the popover.
  // Auto-enabled when there are more than 8 options.
  searchable?: boolean;
  disabled?: boolean;
  // Optional className override for the trigger button.
  triggerClassName?: string;
};

export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable,
  disabled = false,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const shouldShowSearch = searchable ?? options.length > 8;

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

  // Reset search term when closing.
  useEffect(() => {
    if (!open) setSearchTerm("");
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const currentLabel = selected?.label ?? "";
  const isPlaceholder = !selected;

  const filteredOptions = (() => {
    if (!shouldShowSearch || !searchTerm.trim()) return options;
    const term = searchTerm.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.sublabel?.toLowerCase().includes(term) ?? false),
    );
  })();

  function handleSelect(opt: StyledSelectOption) {
    onChange(opt.value, opt.label);
    setOpen(false);
  }

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
            {shouldShowSearch ? (
              <div className="relative border-b border-[#f0e8e0] px-3 py-2">
                <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a59889]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="h-8 w-full rounded-lg border border-[#e2d8cf] bg-white pl-7 pr-2 text-xs text-[#1f1d1c] outline-none focus:border-[#ff7a12]"
                />
              </div>
            ) : null}

            <div className="max-h-56 overflow-y-auto py-1 text-sm">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#9a8f85]">
                  {searchTerm
                    ? `No options match "${searchTerm}".`
                    : "No options available."}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-[#fff7f0] ${
                        isSelected
                          ? "bg-[#fff5ec] text-[#bb5c12]"
                          : "text-[#1f1d1c]"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className={isSelected ? "font-semibold" : ""}>
                          {opt.label}
                        </span>
                        {opt.sublabel ? (
                          <span className="ml-1.5 text-[11px] text-[#9a8f85]">
                            {opt.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#ff7a12]" />
                      ) : null}
                    </button>
                  );
                })
              )}
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
            isPlaceholder
              ? "border-[#e2d8cf] text-[#7b736d]"
              : "border-[#e2d8cf] text-[#1f1d1c] hover:border-[#ffcfad]"
          } disabled:cursor-not-allowed disabled:opacity-60`
        }
      >
        <span className="truncate">{currentLabel || placeholder}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {popover}
    </>
  );
}
