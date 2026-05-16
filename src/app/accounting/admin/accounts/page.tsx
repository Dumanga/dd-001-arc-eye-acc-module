import { AccountingPageIntro, ModuleTiles, SurfaceCard } from "@/components/accounting/accounting-ui";

const accountModules = [
  {
    label: "Chart of Accounts",
    href: "/accounting/admin/accounts/chart-of-accounts",
    detail: "Build the ledger structure for assets, liabilities, equity, income, and expenses.",
  },
  {
    label: "Tax Codes",
    href: "/accounting/admin/accounts/tax-codes",
    detail: "Manage VAT, NBT, zero-rated, and exempt posting rules for billing flows.",
  },
];

export default function AccountsPage() {
  return (
    <>
      <AccountingPageIntro
        eyebrow="Accounts"
        title="Control ledger structure and tax setup."
        description="This sample area groups the core accounting configurations used to manage ledgers and tax behavior."
      />
      <ModuleTiles items={accountModules} />
      <SurfaceCard
        title="What belongs here"
        description="A compact admin overview for master accounting controls."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-[#ece4dc] bg-[#fffaf5] px-4 py-4 text-sm leading-7 text-[#6f6861]">
            Ledger mapping for day-to-day sales, purchase, POS, stock, bank, and adjustment transactions.
          </div>
          <div className="rounded-[22px] border border-[#ece4dc] bg-[#fffaf5] px-4 py-4 text-sm leading-7 text-[#6f6861]">
            Master data used by billing, supplier flows, tax posting, reconciliations, and reports.
          </div>
        </div>
      </SurfaceCard>
    </>
  );
}
