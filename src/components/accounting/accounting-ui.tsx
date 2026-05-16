"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, X } from "lucide-react";
import type {
  AccountingMetric,
  TableColumn,
  TableRow,
} from "@/lib/accounting/accounting-ui-types";

export function AccountingPageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(135deg,#ffffff_0%,#fff9f3_52%,#fff1e3_100%)] px-5 py-5 shadow-[0_22px_55px_rgba(27,24,22,0.05)] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="inline-flex rounded-full border border-[#ffd9bb] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#ff7101]">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h1 className="mt-2 font-sans text-3xl font-semibold tracking-[-0.03em] text-[#1f1d1c] sm:text-[2rem]">
              {title}
            </h1>
          ) : null}
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#6f6861]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 self-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function MetricGrid({ metrics }: { metrics: AccountingMetric[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className="group relative overflow-hidden rounded-[28px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(18,22,33,0.08)]"
        >
          <div
            className={`absolute inset-x-0 top-0 h-1.5 opacity-80 ${
              index % 4 === 0
                ? "bg-[linear-gradient(90deg,#ff7101_0%,rgba(255,113,1,0.05)_100%)]"
                : index % 4 === 1
                  ? "bg-[linear-gradient(90deg,#2d6df6_0%,rgba(45,109,246,0.05)_100%)]"
                  : index % 4 === 2
                    ? "bg-[linear-gradient(90deg,#8b47ff_0%,rgba(139,71,255,0.05)_100%)]"
                    : "bg-[linear-gradient(90deg,#18a66a_0%,rgba(24,166,106,0.05)_100%)]"
            }`}
          />
          <p className="text-sm font-medium text-[#7c746e]">{metric.label}</p>
          <p className="mt-3 font-sans text-3xl font-semibold tracking-[-0.03em] text-[#1f1d1c]">
            {metric.value}
          </p>
          <p className="mt-3 text-sm leading-6 text-[#8c817a]">{metric.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function PremiumMetricGrid({
  items,
  columns = 4,
}: {
  items: Array<{
    label: string;
    value: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "amber" | "blue" | "green" | "violet";
  }>;
  columns?: 3 | 4;
}) {
  const toneStyles = {
    amber: {
      card: "border-[#ffd5b3] bg-[radial-gradient(circle_at_top_left,rgba(255,226,203,0.95),transparent_38%),linear-gradient(180deg,#fffaf5_0%,#fff1e4_100%)]",
      icon: "bg-[linear-gradient(145deg,#ffb67d_0%,#ff7a12_100%)] text-white shadow-[0_16px_28px_rgba(255,122,18,0.22)]",
      chip: "border-[#ffd6b8] bg-white/80 text-[#bb5c12]",
      rail: "bg-[linear-gradient(90deg,#ff8b2b_0%,#ffd4ad_100%)]",
      glow: "bg-[#ffb173]/30",
    },
    blue: {
      card: "border-[#cfe0ff] bg-[radial-gradient(circle_at_top_left,rgba(223,235,255,0.95),transparent_38%),linear-gradient(180deg,#f8fbff_0%,#edf4ff_100%)]",
      icon: "bg-[linear-gradient(145deg,#67a6ff_0%,#2d6df6_100%)] text-white shadow-[0_16px_28px_rgba(45,109,246,0.20)]",
      chip: "border-[#d7e4ff] bg-white/80 text-[#2758b7]",
      rail: "bg-[linear-gradient(90deg,#4c84ff_0%,#cfe0ff_100%)]",
      glow: "bg-[#87b1ff]/25",
    },
    green: {
      card: "border-[#ccebdc] bg-[radial-gradient(circle_at_top_left,rgba(225,248,235,0.98),transparent_38%),linear-gradient(180deg,#f8fdf9_0%,#edf9f1_100%)]",
      icon: "bg-[linear-gradient(145deg,#58c98f_0%,#18a66a_100%)] text-white shadow-[0_16px_28px_rgba(24,166,106,0.20)]",
      chip: "border-[#d4efdf] bg-white/80 text-[#1c7b52]",
      rail: "bg-[linear-gradient(90deg,#30b77a_0%,#c6efd8_100%)]",
      glow: "bg-[#7bdfac]/25",
    },
    violet: {
      card: "border-[#decfff] bg-[radial-gradient(circle_at_top_left,rgba(239,229,255,0.98),transparent_38%),linear-gradient(180deg,#fcfaff_0%,#f2ebff_100%)]",
      icon: "bg-[linear-gradient(145deg,#b381ff_0%,#8b47ff_100%)] text-white shadow-[0_16px_28px_rgba(139,71,255,0.20)]",
      chip: "border-[#e4d9ff] bg-white/80 text-[#6c34cb]",
      rail: "bg-[linear-gradient(90deg,#9c61ff_0%,#dfd0ff_100%)]",
      glow: "bg-[#bc9cff]/25",
    },
  } as const;

  return (
    <div className={`grid gap-3 md:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
      {items.map((item, index) => {
        const tone = toneStyles[item.tone ?? (["amber", "blue", "green", "violet"][index % 4] as keyof typeof toneStyles)];
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className={`group relative overflow-hidden rounded-[24px] border px-4 py-3.5 shadow-[0_14px_30px_rgba(27,24,22,0.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_38px_rgba(27,24,22,0.09)] ${tone.card}`}
          >
            <div className={`absolute right-[-1.25rem] top-[-1.25rem] h-20 w-20 rounded-full blur-2xl transition duration-500 group-hover:scale-125 ${tone.glow}`} />
            <div className="absolute inset-x-5 top-0 h-px bg-white/80" />
            <div className="absolute right-[-2.5rem] top-1 text-[4.4rem] font-semibold tracking-[-0.08em] text-[#1f1d1c]/[0.05] transition duration-500 group-hover:translate-x-[-6px]">
              {item.value}
            </div>
            <div className="relative flex items-start justify-between gap-4">
              <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${tone.chip}`}>
                {item.label}
              </div>
              <div className={`rounded-[18px] p-2.5 transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-105 ${tone.icon}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
            </div>
            <p className="relative mt-3 font-sans text-[2rem] font-semibold tracking-[-0.05em] text-[#1f1d1c]">
              {item.value}
            </p>
            <p className="relative mt-1 max-w-[14rem] text-[13px] leading-5 text-[#706761]">
              {item.detail}
            </p>
            <div className="relative mt-3 overflow-hidden rounded-full bg-white/65">
              <div className={`h-1.5 w-full rounded-full ${tone.rail}`} />
              <div className="absolute inset-y-0 left-[-35%] w-1/3 -skew-x-12 bg-white/55 transition duration-500 group-hover:left-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SurfaceCard({
  title,
  description,
  children,
  overflow = "hidden",
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  overflow?: "hidden" | "visible";
}) {
  const hasHeader = Boolean(title || description);

  return (
    <section
      className={`relative rounded-[28px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-5 shadow-[0_16px_36px_rgba(27,24,22,0.04)] sm:p-6 ${
        overflow === "hidden" ? "overflow-hidden" : "overflow-visible"
      }`}
    >
      <div className="relative">
        {hasHeader ? (
          <div>
            {title ? (
              <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-[#7b736d]">{description}</p>
            ) : null}
          </div>
        ) : null}
        <div className={hasHeader ? "mt-5" : ""}>{children}</div>
      </div>
    </section>
  );
}

export function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

export function ModuleTiles({
  items,
}: {
  items: Array<{ label: string; href: string; detail: string }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group rounded-[24px] border border-[#e4ddd6] bg-[linear-gradient(180deg,#fcfbf9_0%,#fffaf4_100%)] p-5 transition duration-200 hover:-translate-y-1 hover:border-[#ffcfaa] hover:bg-[#fff9f2] hover:shadow-[0_18px_34px_rgba(24,28,39,0.06)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">{item.label}</h3>
              <p className="mt-2 text-sm leading-6 text-[#807770]">{item.detail}</p>
            </div>
            <span className="rounded-xl border border-[#efe2d6] bg-white p-2 text-[#ff7101] transition group-hover:border-[#ff7101]">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function SimpleList({
  rows,
}: {
  rows: Array<[string, string, string, string?]>;
}) {
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.join("-")}
          className="grid gap-2 rounded-[20px] border border-[#e7e0d9] bg-[linear-gradient(180deg,#fcfbf9_0%,#fffdfb_100%)] px-4 py-4 transition hover:border-[#ffdbc1] hover:shadow-[0_10px_20px_rgba(24,28,39,0.04)] md:grid-cols-[1.2fr_1fr_1fr_auto]"
        >
          <div className="font-medium text-[#1f1d1c]">{row[0]}</div>
          <div className="text-sm text-[#786f69]">{row[1]}</div>
          <div className="text-sm text-[#786f69]">{row[2]}</div>
          <div className="text-sm font-semibold text-[#ff7101]">{row[3] ?? ""}</div>
        </div>
      ))}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  onRowClick,
  rowAction,
}: {
  columns: TableColumn[];
  rows: TableRow[];
  onRowClick?: (row: TableRow) => void;
  rowAction?: (row: TableRow) => React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#ddd8d1] shadow-[0_10px_24px_rgba(27,24,22,0.03)]">
      <div className="grid gap-3 p-3 md:hidden">
        {rows.map((row, rowIndex) => (
          <div
            key={`mobile-row-${rowIndex}`}
            onClick={() => onRowClick?.(row)}
            className={`rounded-xl border border-[#e7e0d8] bg-[#fcfbf9] p-4 ${onRowClick ? "cursor-pointer hover:bg-[#fff7f0]" : ""}`}
          >
            <div className="grid gap-2">
              {columns.map((column) => (
                <div
                  key={`${column.key}-${rowIndex}`}
                  className="grid grid-cols-[110px_1fr] gap-3 text-sm"
                >
                  <span className="font-medium text-[#8a7d72]">{column.label}</span>
                  <span className="text-[#1f1d1c]">{row[column.key]}</span>
                </div>
              ))}
              {rowAction && (
                <div className="mt-1 flex justify-end">{rowAction(row)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full border-collapse">
          <thead className="bg-[#faf6f1]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]"
                >
                  {column.label}
                </th>
              ))}
              {rowAction && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                onClick={() => onRowClick?.(row)}
                className={`border-t border-[#ece6df] transition hover:bg-[#fffaf4] ${
                  rowIndex % 2 === 0 ? "bg-white" : "bg-[#fffcf9]"
                } ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-4 text-sm text-[#1f1d1c]">
                    {row[column.key]}
                  </td>
                ))}
                {rowAction && (
                  <td
                    className="px-4 py-4 text-right text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowAction(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MiniPanels({
  items,
}: {
  items: Array<[string, string]>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map(([title, detail]) => (
        <div
          key={title}
          className="rounded-[22px] border border-[#e7e0d8] bg-[linear-gradient(180deg,#fcfbf9_0%,#fffdfb_100%)] p-5"
        >
          <h3 className="text-base font-semibold text-[#1f1d1c]">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-[#7f756f]">{detail}</p>
        </div>
      ))}
    </div>
  );
}

export type ToastState = { tone: "success" | "error"; message: string };

export function StatusToast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const isSuccess = toast.tone === "success";

  return (
    <div className="fixed right-5 top-5 z-[110] w-full max-w-sm">
      <div
        className={`flex items-start gap-3 rounded-[24px] border px-4 py-3 shadow-[0_18px_42px_rgba(27,24,22,0.12)] ${
          isSuccess
            ? "border-[#bfe8cd] bg-[linear-gradient(180deg,#f5fff8_0%,#eafff0_100%)]"
            : "border-[#f3c4bb] bg-[linear-gradient(180deg,#fff8f6_0%,#fff0ec_100%)]"
        }`}
      >
        <span
          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white ${
            isSuccess ? "bg-[#18a66a]" : "bg-[#d75d3d]"
          }`}
        >
          {isSuccess ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isSuccess ? "text-[#176947]" : "text-[#a4442c]"}`}>
            {isSuccess ? "Success" : "Unable to Continue"}
          </p>
          <p className={`mt-1 text-sm leading-6 ${isSuccess ? "text-[#2f5a43]" : "text-[#7b4f44]"}`}>
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition ${
            isSuccess ? "text-[#4e7b60] hover:bg-white/70" : "text-[#925545] hover:bg-white/70"
          }`}
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
