"use client";

import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Phase 5 — branch-aware Create button.
//
// Branch users (CASHIER / DATA_ENTRY / SUPERVISOR): renders a plain "Create"
// button that calls onCreate(undefined). Server auto-injects their storeId.
//
// Super admins: renders a "Create on behalf of [branch]" dropdown. The user
// picks an active branch, then clicks Create — onCreate is called with the
// chosen storeId, which the parent screen forwards to the create POST.
//
// While the viewer info is loading the button shows a spinner. If viewer
// info fails to load, the plain button is rendered as a defensive fallback.
//
// Portal note: the dropdown panel is rendered through React's createPortal
// into document.body so it escapes the AccountingPageIntro container's
// `overflow-hidden`. Without the portal, the panel was being clipped by the
// page intro and looked invisible underneath the KPI cards.

export type ViewerSummary =
  | { role: "SUPER_ADMIN"; storeId: null }
  | { role: "CASHIER" | "DATA_ENTRY" | "SUPERVISOR"; storeId: string };

export type ActiveBranch = { id: string; code: string; name: string };

type PanelStyle = { left: number; top: number; width: number };

export function BranchAwareCreateButton({
  label,
  viewer,
  branches,
  loading,
  onCreate,
}: {
  label: string;
  viewer: ViewerSummary | null;
  branches: ActiveBranch[];
  loading?: boolean;
  onCreate: (storeId: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<PanelStyle | null>(null);

  // Track viewport-relative trigger rect so the portalled panel sits flush
  // beneath it. Recompute on resize and scroll.
  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const PANEL_WIDTH = 288;
      const margin = 8;
      const right = rect.right;
      // Right-align the panel under the trigger; clamp inside viewport.
      let left = right - PANEL_WIDTH;
      if (left < margin) left = margin;
      const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
      if (left > maxLeft) left = maxLeft;
      setPanelStyle({ left, top: rect.bottom + margin, width: PANEL_WIDTH });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !wrapperRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
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

  if (loading || !viewer) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-xl bg-[#f3ece4] px-4 py-2.5 text-sm font-semibold text-[#a09388]"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </button>
    );
  }

  if (viewer.role !== "SUPER_ADMIN") {
    return (
      <button
        type="button"
        onClick={() => onCreate(undefined)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
      >
        {label}
        <ArrowRight className="h-4 w-4" />
      </button>
    );
  }

  const picked = pickedStoreId ? branches.find((b) => b.id === pickedStoreId) : null;

  return (
    <div ref={wrapperRef} className="relative inline-flex flex-col items-end gap-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[#ffcfaa] bg-white px-4 py-2.5 text-sm font-semibold text-[#b45b12] transition hover:bg-[#fff7f0]"
      >
        Create on behalf of
        <span className="rounded-md bg-[#fff1e2] px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em]">
          {picked ? picked.code : "Pick branch"}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_18px_42px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              {branches.length === 0 ? (
                <div className="px-3 py-2.5 text-sm text-[#8b7f75]">No active branches.</div>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setPickedStoreId(b.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      b.id === pickedStoreId
                        ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                        : "text-[#5f5751] hover:bg-[#fff7f0]"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{b.name}</span>{" "}
                      <span className="text-xs text-[#8b7f75]">({b.code})</span>
                    </span>
                    {b.id === pickedStoreId ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

      {picked ? (
        <button
          type="button"
          onClick={() => onCreate(picked.id)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          {label} — {picked.code}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
