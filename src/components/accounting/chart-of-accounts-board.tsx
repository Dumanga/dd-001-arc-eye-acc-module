"use client";

import { Eye, Landmark, PencilLine, PieChart, ReceiptText, Scale, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/api/response";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type {
  AccountingAccountCategoryOption,
  ChartOfAccountRecord,
  ChartOfAccountsCategoryView,
} from "@/lib/accounting/chart-of-accounts-types";

const iconMap = {
  Assets: Wallet,
  Liabilities: Landmark,
  Equity: PieChart,
  Income: ReceiptText,
  Expenses: Scale,
} as const;

const accentMap = {
  Assets: {
    soft: "bg-[#edf6ff]",
    border: "border-[#cfe2ff]",
    badge: "bg-[#2d6df6] text-white",
    icon: "text-[#2d6df6]",
    ring: "shadow-[0_10px_24px_rgba(45,109,246,0.18)]",
    tint: "from-[#f7fbff] to-[#edf6ff]",
    subType: "bg-[#f4f8ff] text-[#315d9b]",
  },
  Liabilities: {
    soft: "bg-[#fff3eb]",
    border: "border-[#ffd9bf]",
    badge: "bg-[#ff7a12] text-white",
    icon: "text-[#ff7a12]",
    ring: "shadow-[0_10px_24px_rgba(255,122,18,0.18)]",
    tint: "from-[#fff9f4] to-[#fff1e7]",
    subType: "bg-[#fff6ef] text-[#ad5a16]",
  },
  Equity: {
    soft: "bg-[#f2edff]",
    border: "border-[#ddd0ff]",
    badge: "bg-[#7c4dff] text-white",
    icon: "text-[#7c4dff]",
    ring: "shadow-[0_10px_24px_rgba(124,77,255,0.18)]",
    tint: "from-[#faf7ff] to-[#f3edff]",
    subType: "bg-[#f6f1ff] text-[#6c4ac7]",
  },
  Income: {
    soft: "bg-[#ebfbf3]",
    border: "border-[#caefd9]",
    badge: "bg-[#169a63] text-white",
    icon: "text-[#169a63]",
    ring: "shadow-[0_10px_24px_rgba(22,154,99,0.18)]",
    tint: "from-[#f7fdf9] to-[#edf9f2]",
    subType: "bg-[#effbf4] text-[#17724d]",
  },
  Expenses: {
    soft: "bg-[#fff8e8]",
    border: "border-[#ffe2a6]",
    badge: "bg-[#c58a00] text-white",
    icon: "text-[#b57f00]",
    ring: "shadow-[0_10px_24px_rgba(197,138,0,0.18)]",
    tint: "from-[#fffdf6] to-[#fff6df]",
    subType: "bg-[#fff8ea] text-[#936900]",
  },
} as const;

async function fetchJson<T>(input: string, signal: AbortSignal) {
  const response = await fetch(input, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Unable to load chart of accounts.");
  }

  return payload.data;
}

function resolveDefaultCategory(
  categories: AccountingAccountCategoryOption[],
  focusCategoryId?: string | null
) {
  if (focusCategoryId) {
    const focused = categories.find((category) => category.id === focusCategoryId);
    if (focused) {
      return focused.id;
    }
  }

  return categories.find((category) => category.name === "Assets")?.id ?? categories[0]?.id ?? "";
}

export function ChartOfAccountsBoard({
  focusCategoryId,
  refreshKey = 0,
  onViewAccount,
  onEditAccount,
}: {
  focusCategoryId?: string | null;
  refreshKey?: number;
  onViewAccount?: (account: ChartOfAccountRecord) => void;
  onEditAccount?: (account: ChartOfAccountRecord) => void;
}) {
  const [categories, setCategories] = useState<AccountingAccountCategoryOption[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [categoryView, setCategoryView] = useState<ChartOfAccountsCategoryView | null>(null);
  const [focusedTypeId, setFocusedTypeId] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    fetchJson<AccountingAccountCategoryOption[]>("/api/accounting/account-categories", controller.signal)
      .then((items) => {
        if (!isCurrent) {
          return;
        }

        setErrorMessage("");
        setCategories(items);
        setActiveCategoryId((current) => {
          if (focusCategoryId && items.some((category) => category.id === focusCategoryId)) {
            return focusCategoryId;
          }

          if (current && items.some((category) => category.id === current)) {
            return current;
          }

          return resolveDefaultCategory(items, focusCategoryId);
        });
      })
      .catch((error: unknown) => {
        if (isCurrent && !(error instanceof DOMException && error.name === "AbortError")) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load account categories.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingCategories(false);
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [focusCategoryId, refreshKey]);

  useEffect(() => {
    if (!activeCategoryId) {
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;

    fetchJson<ChartOfAccountsCategoryView>(
      `/api/accounting/chart-of-accounts?categoryId=${encodeURIComponent(activeCategoryId)}`,
      controller.signal
    )
      .then((payload) => {
        if (isCurrent) {
          setErrorMessage("");
          setCategoryView(payload);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent && !(error instanceof DOMException && error.name === "AbortError")) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load chart of accounts.");
          setCategoryView(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingBoard(false);
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [activeCategoryId, refreshKey]);

  const enhancedCategories = useMemo(() => {
    return categories.map((category) => {
      const Icon = iconMap[category.name as keyof typeof iconMap] ?? Wallet;
      const accent = accentMap[category.name as keyof typeof accentMap] ?? accentMap.Assets;

      return {
        ...category,
        Icon,
        accent,
      };
    });
  }, [categories]);

  const selectedCategory =
    enhancedCategories.find((category) => category.id === activeCategoryId) ?? enhancedCategories[0] ?? null;

  const typeGroups = useMemo(() => {
    if (!categoryView) {
      return [];
    }

    return categoryView.subtypes.reduce<
      Array<{
        typeId: string;
        typeName: string;
        requiresCurrency: boolean;
        subtypes: ChartOfAccountsCategoryView["subtypes"];
        accountCount: number;
      }>
    >((groups, subtype) => {
      const existingGroup = groups.find((group) => group.typeId === subtype.typeId);

      if (existingGroup) {
        existingGroup.subtypes.push(subtype);
        existingGroup.accountCount += subtype.accounts.length;
        return groups;
      }

      groups.push({
        typeId: subtype.typeId,
        typeName: subtype.typeName,
        requiresCurrency: subtype.requiresCurrency,
        subtypes: [subtype],
        accountCount: subtype.accounts.length,
      });

      return groups;
    }, []);
  }, [categoryView]);

  const normalizedFocusedTypeId = typeGroups.some((group) => group.typeId === focusedTypeId) ? focusedTypeId : "";

  const orderedTypeGroups = useMemo(() => {
    if (!normalizedFocusedTypeId) {
      return typeGroups;
    }

    const focusedGroup = typeGroups.find((group) => group.typeId === normalizedFocusedTypeId);

    if (!focusedGroup) {
      return typeGroups;
    }

    return [
      focusedGroup,
      ...typeGroups.filter((group) => group.typeId !== normalizedFocusedTypeId),
    ];
  }, [normalizedFocusedTypeId, typeGroups]);

  if (loadingCategories && !selectedCategory) {
    return (
      <SurfaceCard>
        <div className="rounded-[24px] border border-[#e7e0d9] bg-[#fffdfa] px-5 py-10 text-center text-sm text-[#7c746d]">
          Loading chart of account categories...
        </div>
      </SurfaceCard>
    );
  }

  if (!selectedCategory) {
    return (
      <SurfaceCard>
        <div className="rounded-[24px] border border-[#e7e0d9] bg-[#fffdfa] px-5 py-10 text-center text-sm text-[#7c746d]">
          No account categories are available yet.
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div className="grid gap-6">
      <SurfaceCard>
        <div className="rounded-[28px] border border-[#dbe8f5] bg-[linear-gradient(180deg,#f5fbff_0%,#eef6fb_100%)] p-2.5">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {enhancedCategories.map((category) => {
              const isActive = category.id === selectedCategory.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setLoadingBoard(true);
                    setErrorMessage("");
                    setFocusedTypeId("");
                    setActiveCategoryId(category.id);
                  }}
                  className={`inline-flex w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition xl:min-w-0 ${
                    isActive
                      ? `border-white bg-white text-[#1f1d1c] ${category.accent.ring}`
                      : "border-transparent bg-transparent text-[#36506a] hover:border-white/70 hover:bg-white/70"
                  }`}
                  aria-pressed={isActive}
                >
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${category.accent.soft} ${category.accent.border} border`}
                  >
                    <category.Icon className={`h-4 w-4 ${category.accent.icon}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold xl:truncate">{category.name}</span>
                    <span className="mt-0.5 block text-xs text-[#6f7d89] xl:truncate">
                      {category.description || "Ledger structure"}
                    </span>
                  </span>
                  <span
                    className={`inline-flex min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${category.accent.badge}`}
                  >
                    {category.accountCount ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SurfaceCard>

      <section className="relative overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] p-6 shadow-[0_18px_42px_rgba(27,24,22,0.05)]">
        <div className="absolute right-[-4rem] top-[-4rem] h-40 w-40 rounded-full bg-[#ffe4cd]/60 blur-3xl" />
        <div className="relative">
          <div
            className={`rounded-[26px] border border-[#ebe3db] bg-gradient-to-r ${selectedCategory.accent.tint} p-5`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] border ${selectedCategory.accent.border} ${selectedCategory.accent.soft}`}
                  >
                    <selectedCategory.Icon className={`h-5 w-5 ${selectedCategory.accent.icon}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8e7f72]">
                      Account Category
                    </p>
                    <h2 className="mt-1 font-sans text-2xl font-semibold tracking-[-0.03em] text-[#1f1d1c]">
                      {selectedCategory.name}
                    </h2>
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#716861]">
                  {selectedCategory.description ||
                    "Subtype groupings and created ledger accounts for this category are shown below."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                    Subtypes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#1f1d1c]">
                    {categoryView?.subtypeCount ?? selectedCategory.subtypeCount ?? 0}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                    Created Accounts
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#1f1d1c]">
                    {categoryView?.accountCount ?? selectedCategory.accountCount ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {!loadingBoard && typeGroups.length ? (
              <div className="mt-5 rounded-[22px] border border-white/70 bg-white/80 px-4 py-4 backdrop-blur-sm">
                <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex min-w-max items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFocusedTypeId("")}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                        !normalizedFocusedTypeId
                          ? selectedCategory.accent.badge
                          : "border border-[#eadfd5] bg-white text-[#6f655d] hover:bg-[#fff8f1]"
                      }`}
                      style={{ flexShrink: 0 }}
                    >
                      Default Order
                    </button>
                    {typeGroups.map((group) => {
                      const isFocused = group.typeId === normalizedFocusedTypeId;

                      return (
                        <button
                          key={group.typeId}
                          type="button"
                          onClick={() => setFocusedTypeId(group.typeId)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            isFocused
                              ? selectedCategory.accent.badge
                              : "border border-[#eadfd5] bg-white text-[#6f655d] hover:bg-[#fff8f1]"
                          }`}
                          style={{ flexShrink: 0 }}
                        >
                          {group.typeName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[22px] border border-[#ffd9d0] bg-[linear-gradient(180deg,#fff8f6_0%,#fff1ee_100%)] px-5 py-4 text-sm text-[#a05031]">
              {errorMessage}
            </div>
          ) : null}

          {!errorMessage && loadingBoard ? (
            <div className="mt-6 rounded-[22px] border border-[#e7e0d9] bg-[#fffdfa] px-5 py-10 text-center text-sm text-[#7c746d]">
              Loading chart of accounts...
            </div>
          ) : null}

          {!errorMessage && !loadingBoard && categoryView ? (
            <div className="mt-6 overflow-hidden rounded-[26px] border border-[#e7e0d9]">
              <div className="hidden grid-cols-[2.2fr_4fr] gap-5 bg-[#faf6f1] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7e72] md:grid">
                <div>Account Type &amp; Subtype</div>
                <div>Created Accounts</div>
              </div>

              <div className="bg-white">
                {orderedTypeGroups.map((group, groupIndex) => (
                  <div
                    key={group.typeId}
                    className={`${groupIndex === 0 ? "" : "border-t border-[#efe8e1]"}`}
                  >
                    <div className="border-b border-[#efe8e1] bg-[linear-gradient(180deg,#fffcf8_0%,#fff8f0_100%)] px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8e7f72]">
                            Account Type
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-lg font-semibold text-[#1f1d1c]">{group.typeName}</span>
                            {group.requiresCurrency ? (
                              <span className="inline-flex rounded-full border border-[#dbe8f5] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#315d9b]">
                                Currency Based
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {group.typeId === focusedTypeId ? (
                            <span className="inline-flex rounded-full border border-[#d9e5f7] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#315d9b]">
                              Focused
                            </span>
                          ) : null}
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedCategory.accent.subType}`}>
                            {group.subtypes.length} {group.subtypes.length === 1 ? "Subtype" : "Subtypes"}
                          </span>
                          <span className="inline-flex rounded-full border border-[#eadfd5] bg-white px-3 py-1 text-xs font-semibold text-[#7d6f64]">
                            {group.accountCount} {group.accountCount === 1 ? "Account" : "Accounts"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-5">
                      <div className="grid gap-4">
                        {group.subtypes.map((subtype, subtypeIndex) => (
                          <div
                            key={subtype.id}
                            className={`grid gap-5 md:grid-cols-[2.2fr_4fr] md:items-start ${
                              subtypeIndex === 0 ? "" : "border-t border-dashed border-[#eee4db] pt-4"
                            }`}
                          >
                            <div>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedCategory.accent.subType}`}
                              >
                                {subtype.name}
                              </span>
                              <p className="mt-2 text-sm leading-6 text-[#746b64]">
                                {subtype.description || `Accounts mapped under ${group.typeName}.`}
                              </p>
                            </div>

                            <div className="grid gap-3">
                              {subtype.accounts.length ? (
                                subtype.accounts.map((account) => (
                                  <div
                                    key={account.id}
                                    className="rounded-[20px] border border-[#ece4dc] bg-[linear-gradient(180deg,#fffdfa_0%,#fff8f0_100%)] px-4 py-3"
                                  >
                                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-[#1f1d1c]">
                                            {account.code} {account.name}
                                          </p>
                                          <p className="mt-1 text-xs text-[#8a7d72]">
                                            Mapped under {subtype.name}
                                            {account.currencyCode ? ` - ${account.currencyCode}` : ""}
                                          </p>
                                        </div>
                                        <span
                                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                            account.isActive
                                              ? "bg-[#edf9f1] text-[#1b7a50]"
                                              : "bg-[#fff5e8] text-[#b56a16]"
                                          }`}
                                        >
                                          {account.isActive ? "Active" : "Inactive"}
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap gap-2 md:justify-end">
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-xl border border-[#d9e5f7] bg-white px-3 py-2 text-[#315d9b] transition hover:border-[#bfd4f5] hover:bg-[#f7fbff]"
                                          aria-label={`View ${account.name}`}
                                          onClick={() => onViewAccount?.(account)}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-xl border border-[#ffe0c5] bg-white px-3 py-2 text-[#c46718] transition hover:border-[#ffd0a8] hover:bg-[#fff8f2]"
                                          aria-label={`Edit ${account.name}`}
                                          onClick={() => onEditAccount?.(account)}
                                        >
                                          <PencilLine className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-[20px] border border-dashed border-[#eadfd5] bg-[#fcfaf7] px-4 py-6 text-sm text-[#7a7068]">
                                  No accounts found yet for {subtype.name}.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
