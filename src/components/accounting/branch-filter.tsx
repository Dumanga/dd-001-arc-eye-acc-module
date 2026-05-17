"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ActiveBranch,
  ViewerSummary,
} from "@/components/accounting/branch-aware-create-button";

// Per-branch filter dropdown rendered in the list-screen header for super
// admins only. Branch users see nothing here — they're already locked to
// their own branch by the server-side filter.
//
// `selectedStoreId` of `null` means "All branches".

export function BranchFilter({
  viewer,
  branches,
  selectedStoreId,
  onChange,
}: {
  viewer: ViewerSummary | null;
  branches: ActiveBranch[];
  selectedStoreId: string | null;
  onChange: (storeId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Hide the filter for branch users (server already locks them to their
  // branch) and when there are 0-1 active branches (filter would be a no-op).
  if (!viewer || viewer.role !== "SUPER_ADMIN" || branches.length < 2) {
    return null;
  }

  const picked = selectedStoreId ? branches.find((b) => b.id === selectedStoreId) : null;

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-sm font-semibold text-[#5f5751] transition hover:bg-[#fff7f0]"
      >
        <span className="text-xs uppercase tracking-[0.16em] text-[#8b7f75]">Branch</span>
        <span className="rounded-md bg-[#fff1e2] px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#b45b12]">
          {picked ? picked.code : "All"}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
              selectedStoreId === null
                ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                : "text-[#5f5751] hover:bg-[#fff7f0]"
            }`}
          >
            <span className="font-medium">All branches</span>
            {selectedStoreId === null ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
          </button>
          <div className="my-1 border-t border-[#eee4db]" />
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onChange(b.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                b.id === selectedStoreId
                  ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                  : "text-[#5f5751] hover:bg-[#fff7f0]"
              }`}
            >
              <span>
                <span className="font-medium">{b.name}</span>{" "}
                <span className="text-xs text-[#8b7f75]">({b.code})</span>
              </span>
              {b.id === selectedStoreId ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
