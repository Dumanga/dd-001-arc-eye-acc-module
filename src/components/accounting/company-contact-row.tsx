import { Mail, MapPin, Phone } from "lucide-react";

// Outward-facing company contact rendered on every printable accounting
// document (quotation, invoice, GRN, returns, payments, vouchers, PO,
// stock report). Single source of truth — update here once and every
// preview/print picks up the new values.
//
// Promotable to a settings table later if branches ever need their own
// contact footers; for now ArcEye DC has one head-office address/phone/
// email that goes on all customer-facing paper.
export const COMPANY_CONTACT = {
  address: "B25/GF4, Mount Clifford Range, Homagama",
  phones: ["+94 76 996 8001", "+94 74 0765 765"],
  email: "hello@arceyedc.com",
} as const;

// Three-column row designed to sit inside the cyan header band of an
// accounting preview, directly under the logo + document-number strip.
// Icons tint with the brand accent so the row reads as part of the
// header rather than a separate band of text.
export function CompanyContactRow() {
  return (
    <div className="grid grid-cols-3 items-center gap-4 px-8 py-3 text-[11px] text-[#3f3b38]">
      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 flex-none text-[#0891a8]" />
        <span className="leading-snug">{COMPANY_CONTACT.phones.join("  ·  ")}</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Mail className="h-3.5 w-3.5 flex-none text-[#0891a8]" />
        <span className="leading-snug text-[#0891a8]">{COMPANY_CONTACT.email}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <MapPin className="h-3.5 w-3.5 flex-none text-[#0891a8]" />
        <span className="leading-snug">{COMPANY_CONTACT.address}</span>
      </div>
    </div>
  );
}

// Thin divider that visually ties the contact row to the header strip
// while still letting it read as a distinct row. Use between the
// logo-row and <CompanyContactRow /> inside the cyan band.
export function CompanyContactDivider() {
  return <div className="mx-8 h-px bg-[#cdeef3]/70" />;
}
