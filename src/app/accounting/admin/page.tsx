import type { CSSProperties } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileSpreadsheet,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { requireAccountingAccess } from "@/lib/auth/accounting";
import { loadDashboardData } from "@/lib/accounting/dashboard-data";
import { fmtMoneyAlways } from "@/lib/accounting/reports-shared";
import { PendingFormsButton } from "@/components/accounting/pending-forms-button";

const quickActions = [
  {
    title: "Invoice",
    href: "/accounting/admin/customers/invoices",
    icon: ReceiptText,
    tone: "from-[#fff1e4] via-[#fff8f1] to-[#ffffff]",
    glow: "bg-[#ffcfac]/60",
  },
  {
    title: "Purchase Order",
    href: "/accounting/admin/suppliers/purchase-orders",
    icon: FileSpreadsheet,
    tone: "from-[#edf4ff] via-[#f7faff] to-[#ffffff]",
    glow: "bg-[#cfe0ff]/70",
  },
  {
    title: "Stock Report",
    href: "/accounting/admin/inventory/stock",
    icon: Boxes,
    tone: "from-[#eafbf2] via-[#f4fcf8] to-[#ffffff]",
    glow: "bg-[#bdebd2]/65",
  },
  {
    title: "GRN",
    href: "/accounting/admin/suppliers/grn",
    icon: PackageCheck,
    tone: "from-[#f4efff] via-[#faf8ff] to-[#ffffff]",
    glow: "bg-[#ddd0ff]/65",
  },
];

const branchTones = [
  "bg-[#fff3e8] text-[#ff7101]",
  "bg-[#eef5ff] text-[#2d6df6]",
  "bg-[#f4efff] text-[#8b47ff]",
  "bg-[#e9fbf2] text-[#18a66a]",
];

export default async function AccountingDashboardPage() {
  const currentUser = await requireAccountingAccess("dashboard");
  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";
  const data = await loadDashboardData();

  const summaryCards = [
    {
      label: "Today Revenue",
      value: fmtMoneyAlways(data.todayRevenue),
      detail: "Posted POS + approved invoices today",
      icon: CircleDollarSign,
      tint: "bg-[#fff1e6] text-[#ff7101]",
      glow: "#ff7101",
    },
    {
      label: "Receivables",
      value: fmtMoneyAlways(data.receivables),
      detail: "Open customer dues (net of payments)",
      icon: TrendingUp,
      tint: "bg-[#eaf2ff] text-[#2d6df6]",
      glow: "#2d6df6",
    },
    {
      label: "Payables",
      value: fmtMoneyAlways(data.payables),
      detail: "Open supplier dues (net of payments)",
      icon: TrendingDown,
      tint: "bg-[#f4ebff] text-[#8b47ff]",
      glow: "#8b47ff",
    },
    {
      label: "Active Branches",
      value: String(data.activeBranchCount),
      detail: "Branches in active operation",
      icon: Users,
      tint: "bg-[#e9fbf2] text-[#18a66a]",
      glow: "#18a66a",
    },
  ];

  const pulseCards = [
    {
      label: "Bills today",
      value: String(data.todayBillCount),
      detail: "POS bills posted",
      icon: ReceiptText,
      tint: "bg-[#fff1e6] text-[#ff7101]",
      glow: "#ff7101",
    },
    {
      label: "Invoices today",
      value: String(data.todayInvoiceCount),
      detail: "Approved today",
      icon: ClipboardList,
      tint: "bg-[#eaf2ff] text-[#2d6df6]",
      glow: "#2d6df6",
    },
    {
      label: "Open POs",
      value: String(data.openPoCount),
      detail: "Draft or sent",
      icon: FileSpreadsheet,
      tint: "bg-[#fff5e0] text-[#b8780b]",
      glow: "#d99412",
    },
    {
      label: "Pending GRNs",
      value: String(data.pendingGrnCount),
      detail: "Awaiting approval",
      icon: Truck,
      tint: "bg-[#f4ebff] text-[#8b47ff]",
      glow: "#8b47ff",
    },
    {
      label: "Customer returns",
      value: String(data.pendingCustomerReturnCount),
      detail: "Drafts pending",
      icon: RotateCcw,
      tint: "bg-[#ffeded] text-[#d33b3b]",
      glow: "#d33b3b",
    },
    {
      label: "Inventory items",
      value: String(data.inventoryItemCount),
      detail: "Active stocked SKUs",
      icon: PackageSearch,
      tint: "bg-[#e9fbf2] text-[#18a66a]",
      glow: "#18a66a",
    },
    {
      label: "Out of stock",
      value: String(data.outOfStockCount),
      detail: "SKUs at zero or less",
      icon: AlertTriangle,
      tint: "bg-[#ffe9e0] text-[#d65a1a]",
      glow: "#d65a1a",
    },
    {
      label: "Suppliers",
      value: String(data.activeSupplierCount),
      detail: "In the supplier book",
      icon: Users,
      tint: "bg-[#eaf6ff] text-[#3a8ab8]",
      glow: "#3a8ab8",
    },
  ];

  // Header date stamp, rendered in Sri Lanka time so it lines up
  // with the day-boundary used by the metrics.
  const todayLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="grid content-start gap-3">
      <section className="relative overflow-hidden rounded-[22px] border border-[#ddd8d1] bg-[linear-gradient(135deg,#ffffff_0%,#fcfaf6_55%,#fff3e6_100%)] px-5 py-3.5 shadow-[0_14px_28px_rgba(27,24,22,0.035)] sm:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex rounded-full border border-[#ffd9bb] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#ff7101]">
                Finance Overview
              </p>
              <p className="inline-flex rounded-full border border-[#e5ddd5] bg-white/70 px-3 py-1 text-[11px] font-medium text-[#6b6259]">
                {todayLabel}
              </p>
            </div>
            <h1 className="mt-1.5 font-sans text-[1.85rem] font-semibold tracking-[-0.04em] text-[#1f1d1c]">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#726a63]">
              Quick control over billing, suppliers, branches, and POS.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin ? <PendingFormsButton /> : null}
            <Link
              href="/accounting/admin/pos"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-[#ff7a12] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
            >
              Open POS
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="glow-border group transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(18,22,33,0.06)]"
              style={{ "--glow": card.glow } as CSSProperties}
            >
              <div className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className={`inline-flex rounded-[14px] p-2 ${card.tint}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#9a918a]">
                    {card.label}
                  </p>
                </div>
                <p className="mt-3 truncate font-sans text-[1.45rem] font-semibold tabular-nums tracking-[-0.03em] text-[#1f1d1c]">
                  {card.value}
                </p>
                <p className="mt-1 text-xs leading-4 text-[#867c75]">{card.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[24px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-4 shadow-[0_16px_36px_rgba(27,24,22,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans text-lg font-semibold text-[#1f1d1c]">
                Quick Access
              </h2>
              <p className="mt-1 text-sm text-[#7b736d]">
                Fast shortcuts for daily accounting work.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`group relative overflow-hidden rounded-[18px] border border-[#e5ddd5] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${item.tone} p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#ffcfa9] hover:shadow-[0_16px_28px_rgba(24,28,39,0.06)]`}
                >
                  <div className={`pointer-events-none absolute right-[-18px] top-[-18px] h-20 w-20 rounded-full blur-2xl ${item.glow}`} />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-[14px] bg-white/90 p-2 text-[#ff7101] shadow-[0_8px_16px_rgba(0,0,0,0.04)]">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-sans text-sm font-semibold text-[#1f1d1c]">
                        {item.title}
                      </span>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-[#8d7d71] transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="flex min-w-0 flex-col rounded-[24px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-4 shadow-[0_16px_36px_rgba(27,24,22,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans text-lg font-semibold text-[#1f1d1c]">
                Branch Snapshot
              </h2>
              <p className="mt-1 text-sm text-[#7b736d]">
                Today’s revenue across active branches.
              </p>
            </div>
            <div className="rounded-2xl bg-[#fff3e8] p-2.5 text-[#ff7101]">
              <Building2 className="h-4 w-4" />
            </div>
          </div>

          {data.branches.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-[#e5ddd5] bg-[#fcfbf9] p-4 text-sm text-[#867c75]">
              No active branches configured yet.
            </p>
          ) : (
            // Horizontal scroller — keeps the card height stable as
            // the branch list grows. min-w-0 on the parent column is
            // what actually lets this clip inside the grid track.
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-full gap-3 px-1">
                {data.branches.map((branch, idx) => (
                  <div
                    key={branch.id}
                    className="flex w-[210px] flex-none flex-col rounded-[18px] border border-[#e5ddd5] bg-[#fcfbf9] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className="min-w-0 flex-1 truncate font-sans text-sm font-semibold text-[#1f1d1c]"
                        title={branch.name}
                      >
                        {branch.name}
                      </h3>
                      <span
                        className={`flex-none rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          branchTones[idx % branchTones.length]
                        }`}
                      >
                        {branch.city || "Live"}
                      </span>
                    </div>
                    <p className="mt-3 truncate font-sans text-[1.45rem] font-semibold leading-tight text-[#1f1d1c]">
                      {fmtMoneyAlways(branch.todayRevenue)}
                    </p>
                    <p className="mt-1 text-xs leading-4 text-[#7d736d]">
                      POS + invoices today
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[24px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-4 shadow-[0_16px_36px_rgba(27,24,22,0.04)]">
        <div className="mb-3">
          <h2 className="font-sans text-lg font-semibold text-[#1f1d1c]">
            Accounting Pulse
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Orders, stock, and counter activity at a glance.
          </p>
        </div>

        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8">
          {pulseCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="glow-border glow-border-sm group transition duration-200 hover:-translate-y-0.5"
                style={{ "--glow": card.glow } as CSSProperties}
              >
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`inline-flex rounded-[10px] p-1.5 ${card.tint}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <p className="mt-2.5 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-[#9a918a]">
                    {card.label}
                  </p>
                  <p className="mt-1 truncate font-sans text-[1.35rem] font-semibold tabular-nums tracking-[-0.02em] text-[#1f1d1c]">
                    {card.value}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-[#867c75]">
                    {card.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
