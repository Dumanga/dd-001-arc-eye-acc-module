"use client";

// Slim "add supplier" popup used inside the GRN and Purchase Order
// flows so buyers can register a new supplier without leaving the
// current document. Submits to the same POST /api/accounting/suppliers
// endpoint as the full supplier form, but exposes only the minimum
// required fields (code, name, mobile, email, currency). The rest of
// the supplier profile (address, tax codes, bank accounts, sales
// contacts) can be filled in later via Settings → Suppliers.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

const DEFAULT_COUNTRY_CODE = "LK";
const DEFAULT_CURRENCY = "LKR";
const SUPPORTED_CURRENCIES = ["LKR", "USD", "GBP", "EUR", "AUD"];

// Minimal shape of the create response. We only need id/code/name to
// auto-select on the parent's supplier picker.
type CreatedSupplier = {
  id: string;
  supplierCode: string;
  supplierName: string;
};

type SupplierQuickCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: CreatedSupplier) => void;
};

export function SupplierQuickCreateModal({
  open,
  onClose,
  onCreated,
}: SupplierQuickCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setName("");
    setMobile("");
    setEmail("");
    setCurrency(DEFAULT_CURRENCY);
    setError(null);
    setSubmitting(false);
    setTimeout(() => codeRef.current?.focus(), 30);
  }, [open]);

  if (!mounted || !open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode) {
      setError("Supplier code is required.");
      return;
    }
    if (/\s/.test(trimmedCode)) {
      setError("Spaces are not allowed in the supplier code.");
      return;
    }
    if (!trimmedName) {
      setError("Supplier name is required.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Supplier email is required.");
      return;
    }
    const cleanMobile = mobile.replace(/\D/g, "");
    if (!cleanMobile) {
      setError("Supplier phone number is required.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounting/suppliers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify({
          supplierCode: trimmedCode,
          supplierName: trimmedName,
          email: trimmedEmail,
          // Send LK + the local-number as a pair so the strict
          // server-side phone validator accepts it. The full form
          // does the same; we just hide the country picker here and
          // hard-code LK because that covers the vast majority of
          // local suppliers. Different country? edit the full form.
          primaryMobileCountryCode: DEFAULT_COUNTRY_CODE,
          primaryMobile: cleanMobile,
          alternateMobileCountryCode: DEFAULT_COUNTRY_CODE,
          alternateMobile: "",
          currency,
          // Address / bank / sales-contact arrays default to empty
          // on the server when omitted.
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: CreatedSupplier | null;
        message?: string;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setError(payload.message || "Could not create supplier.");
        setSubmitting(false);
        return;
      }
      onCreated(payload.data);
      onClose();
    } catch {
      setError("Network error — could not reach the server.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(33,27,23,0.55)] px-4 py-6">
      <div className="w-full max-w-md rounded-[26px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
              Quick add
            </p>
            <h3 className="mt-1 font-sans text-lg font-semibold text-[#1f1d1c]">
              New supplier
            </h3>
            <p className="mt-1 text-xs text-[#7c6f65]">
              Just the essentials — address, tax codes and bank accounts
              can be filled in later from the suppliers screen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-1 text-[#9b8f87] transition hover:bg-[#fff7f0] hover:text-[#1f1d1c] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Supplier code <span className="text-[#c95d37]">*</span>
            </span>
            <input
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="e.g. SUP-001"
              maxLength={30}
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm uppercase text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Supplier name <span className="text-[#c95d37]">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter supplier name"
              maxLength={120}
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Mobile (Sri Lanka) <span className="text-[#c95d37]">*</span>
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="Numbers only — country code added automatically"
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Email <span className="text-[#c95d37]">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supplier@example.com"
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-2 text-sm text-[#b94f37]">
              {error}
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs font-semibold text-[#6f6761] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)] transition hover:bg-[#ff8a2c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create supplier"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
