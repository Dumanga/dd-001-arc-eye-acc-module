"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DeliveryDatePicker } from "@/components/delivery-date-picker";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  printRepairReceipt,
  type RepairReceiptData,
  type RepairReceiptLine,
} from "@/lib/print/repair-receipt";

const statusMeta: Record<
  string,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-400/15 text-amber-400",
  },
  PROCESSING: {
    label: "Processing",
    className: "bg-sky-400/15 text-sky-400",
  },
  REPAIR_COMPLETED: {
    label: "Repair Completed",
    className: "bg-emerald-400/15 text-emerald-400",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-zinc-400/15 text-zinc-400",
  },
};

type RepairItem = {
  id: string;
  billNo: string;
  physicalBillNo?: string | null;
  trackingToken?: string;
  intakeType: "WALK_IN" | "COURIER";
  createdAt?: string;
  totalAmount: number;
  advanceAmount: number;
  estimatedDeliveryDate: string;
  description?: string | null;
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  isPostponed: boolean;
  client: { id: string; name: string; mobile: string };
  brand: { id: string; name: string };
  repairTypeId?: string | null;
  items?: Array<{
    id: string;
    repairTypeId: string;
    price: number;
    repairType?: { id: string; name: string; code: string } | null;
  }>;
  store: { id: string; name: string };
};

type RepairResponse = {
  items: RepairItem[];
  total: number;
  page: number;
  pageSize: number;
};

type ClientOption = {
  id: string;
  name: string;
  mobile: string;
  tier?: "BRONZE" | "SILVER" | "GOLD";
};

type BrandOption = {
  id: string;
  name: string;
};

type StoreOption = {
  id: string;
  name: string;
  code?: string;
  city?: string;
};

type RepairTypeItem = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type RepairLineItem = {
  id: string;
  repairTypeId: string;
  repairTypeName: string;
  price: string;
};

type EditSnapshot = {
  intakeType: string;
  selectedDate: string;
  physicalBillNo: string;
  advanceAmount: string;
  description: string;
  itemsSignature: string;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
};

function normalizeRepairItems(items: RepairLineItem[]) {
  return items.map((item) => ({
    repairTypeId: item.repairTypeId.trim(),
    price: Number(item.price || 0),
  }));
}

function createItemsSignature(items: RepairLineItem[]) {
  return JSON.stringify(normalizeRepairItems(items));
}

function formatMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("94") && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  return value;
}

function toReceiptLines(repair: RepairItem): RepairReceiptLine[] {
  if (repair.items && repair.items.length > 0) {
    return repair.items.map((item, index) => {
      const fallbackName = `Repair Item ${index + 1}`;
      const itemName = item.repairType
        ? `${item.repairType.code} - ${item.repairType.name}`
        : fallbackName;
      return {
        name: itemName,
        amount: item.price,
      };
    });
  }

  return [
    {
      name: repair.brand.name,
      amount: repair.totalAmount,
    },
  ];
}

function buildReceiptPayload(repair: RepairItem): RepairReceiptData {
  const lines = toReceiptLines(repair);
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const total = repair.totalAmount > 0 ? repair.totalAmount : subtotal;
  const advance = repair.advanceAmount;
  const balance = Math.max(0, total - advance);
  return {
    copyType: "REPAIR",
    billNo: repair.billNo,
    physicalBillNo: repair.physicalBillNo ?? null,
    description: repair.description ?? null,
    issuedAt: repair.createdAt ? new Date(repair.createdAt) : new Date(),
    estimatedDeliveryDate: repair.estimatedDeliveryDate,
    clientName: repair.client.name,
    clientMobile: formatMobile(repair.client.mobile),
    brandName: repair.brand.name,
    storeName: repair.store.name,
    intakeType: repair.intakeType,
    status: repair.status,
    lines,
    subtotal,
    total,
    advance,
    balance,
  };
}

function buildReceiptPayloadWithCopyType(
  repair: RepairItem,
  copyType: "REPAIR" | "CUSTOMER"
) {
  return {
    ...buildReceiptPayload(repair),
    copyType,
  };
}

export default function RepairsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRepairTypes, setShowRepairTypes] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeType, setIntakeType] = useState("Walk-in");
  const [clientOpen, setClientOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [clientPage, setClientPage] = useState(1);
  const [clientHasMore, setClientHasMore] = useState(false);
  const [clientLoadingMore, setClientLoadingMore] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientReloadToken, setClientReloadToken] = useState(0);
  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [clientCreateName, setClientCreateName] = useState("");
  const [clientCreateMobile, setClientCreateMobile] = useState("");
  const [clientCreateTier, setClientCreateTier] = useState<"BRONZE" | "SILVER" | "GOLD">("BRONZE");
  const [clientCreateSaving, setClientCreateSaving] = useState(false);
  const [clientCreateError, setClientCreateError] = useState<string | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billLoading, setBillLoading] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandPage, setBrandPage] = useState(1);
  const [brandHasMore, setBrandHasMore] = useState(false);
  const [brandLoadingMore, setBrandLoadingMore] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<BrandOption | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [brandReloadToken, setBrandReloadToken] = useState(0);
  const [brandCreateOpen, setBrandCreateOpen] = useState(false);
  const [brandCreateName, setBrandCreateName] = useState("");
  const [brandCreateSaving, setBrandCreateSaving] = useState(false);
  const [brandCreateError, setBrandCreateError] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeLoading, setStoreLoading] = useState(false);
  const [storePage, setStorePage] = useState(1);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeLoadingMore, setStoreLoadingMore] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreOption | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState("");
  const [physicalBillNo, setPhysicalBillNo] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [description, setDescription] = useState("");
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [repairsTotal, setRepairsTotal] = useState(0);
  const [repairsPage, setRepairsPage] = useState(1);
  const repairsPageSize = 10;
  const [repairsLoading, setRepairsLoading] = useState(false);
  const [repairsError, setRepairsError] = useState<string | null>(null);
  const [repairsSearch, setRepairsSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [kpiCounts, setKpiCounts] = useState({
    pending: 0,
    processing: 0,
    completed: 0,
    delivered: 0,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingRepairId, setEditingRepairId] = useState<string | null>(null);
  const [initialDeliveryDate, setInitialDeliveryDate] = useState<string | null>(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [pendingStatusRepair, setPendingStatusRepair] = useState<RepairItem | null>(null);
  const [currentRole, setCurrentRole] = useState<null | "SUPER_ADMIN" | "CASHIER" | "REPAIR_STAFF">(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RepairItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repairTypeSearch, setRepairTypeSearch] = useState("");
  const [repairTypePage, setRepairTypePage] = useState(1);
  const [repairTypes, setRepairTypes] = useState<RepairTypeItem[]>([]);
  const [repairTypeTotal, setRepairTypeTotal] = useState(0);
  const repairTypePageSize = 10;
  const [repairTypeLoading, setRepairTypeLoading] = useState(false);
  const [repairTypeError, setRepairTypeError] = useState<string | null>(null);
  const [repairTypeName, setRepairTypeName] = useState("");
  const [repairTypeCode, setRepairTypeCode] = useState("");
  const [repairTypeSaving, setRepairTypeSaving] = useState(false);
  const [repairTypeEditingId, setRepairTypeEditingId] = useState<string | null>(null);
  const [repairTypeDeleteOpen, setRepairTypeDeleteOpen] = useState(false);
  const [pendingRepairTypeDelete, setPendingRepairTypeDelete] =
    useState<RepairTypeItem | null>(null);
  const [deliveryCounts, setDeliveryCounts] = useState<Record<string, number>>(
    {}
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [repairTypeOptions, setRepairTypeOptions] = useState<RepairTypeItem[]>([]);
  const [repairTypeOptionsLoading, setRepairTypeOptionsLoading] = useState(false);
  const [repairTypeOpenId, setRepairTypeOpenId] = useState<string | null>(null);
  const [repairTypeSearchTerm, setRepairTypeSearchTerm] = useState("");
  const [repairItems, setRepairItems] = useState<RepairLineItem[]>([
    { id: "item-1", repairTypeId: "", repairTypeName: "", price: "" },
  ]);
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null);

  const trackingBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  const trackingUrl = useMemo(() => {
    if (!trackingBaseUrl || !trackingToken) {
      return "";
    }
    const normalizedBase = trackingBaseUrl.replace(/\/+$/, "");
    return `${normalizedBase}/tracking?token=${encodeURIComponent(trackingToken)}`;
  }, [trackingBaseUrl, trackingToken]);

  const totalRepairPages = useMemo(() => {
    return Math.max(1, Math.ceil(repairsTotal / repairsPageSize));
  }, [repairsTotal, repairsPageSize]);

  const totalRepairTypePages = useMemo(() => {
    return Math.max(1, Math.ceil(repairTypeTotal / repairTypePageSize));
  }, [repairTypeTotal, repairTypePageSize]);

  const computedTotalAmount = useMemo(() => {
    return repairItems.reduce((sum, item) => {
      const value = Number(item.price);
      if (!Number.isFinite(value)) {
        return sum;
      }
      return sum + value;
    }, 0);
  }, [repairItems]);

  const isEditUnchanged = useMemo(() => {
    if (!editMode || !editSnapshot) {
      return false;
    }

    const current = {
      intakeType: intakeType.trim(),
      selectedDate: selectedDate.trim(),
      physicalBillNo: physicalBillNo.trim(),
      advanceAmount: String(Number(advanceAmount || 0)),
      description: description.trim(),
      itemsSignature: createItemsSignature(repairItems),
    };

    return (
      current.intakeType === editSnapshot.intakeType &&
      current.selectedDate === editSnapshot.selectedDate &&
      current.physicalBillNo === editSnapshot.physicalBillNo &&
      current.advanceAmount === editSnapshot.advanceAmount &&
      current.description === editSnapshot.description &&
      current.itemsSignature === editSnapshot.itemsSignature
    );
  }, [editMode, editSnapshot, intakeType, selectedDate, physicalBillNo, advanceAmount, description, repairItems]);

  const handleCalendarMonthChange = useCallback(async (year: number, month: number) => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const monthParam = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
      const response = await fetch(`/api/repairs/calendar?month=${monthParam}`);
      const payload = (await response.json()) as {
        success: boolean;
        data: { counts: Record<string, number> } | null;
        message: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to load calendar counts.");
      }
      setDeliveryCounts(payload.data.counts);
    } catch (err) {
      setCalendarError(
        err instanceof Error ? err.message : "Unable to load calendar counts."
      );
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const loadRepairs = useCallback(async () => {
    setRepairsLoading(true);
    setRepairsError(null);
    try {
      const params = new URLSearchParams({
        page: String(repairsPage),
        pageSize: String(repairsPageSize),
      });
      if (repairsSearch.trim()) {
        params.set("search", repairsSearch.trim());
      }
      if (statusFilter && statusFilter !== "ACTIVE" && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (statusFilter === "ACTIVE") {
        params.set("excludeDelivered", "1");
      }

      const response = await fetch(`/api/repairs?${params.toString()}`);
      const payload = (await response.json()) as {
        success: boolean;
        data: RepairResponse | null;
        message: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to load repairs.");
      }
      setRepairs(payload.data.items);
      setRepairsTotal(payload.data.total);
    } catch (err) {
      setRepairsError(
        err instanceof Error ? err.message : "Unable to load repairs."
      );
    } finally {
      setRepairsLoading(false);
    }
  }, [repairsPage, repairsPageSize, repairsSearch, statusFilter]);

  const loadKpiCounts = useCallback(async () => {
    async function fetchStatusCount(
      status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED"
    ) {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "1",
        status,
      });
      const response = await fetch(`/api/repairs?${params.toString()}`);
      const payload = (await response.json()) as {
        success: boolean;
        data: RepairResponse | null;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error("Unable to load KPI counts.");
      }
      return payload.data.total;
    }

    try {
      const [pending, processing, completed, delivered] = await Promise.all([
        fetchStatusCount("PENDING"),
        fetchStatusCount("PROCESSING"),
        fetchStatusCount("REPAIR_COMPLETED"),
        fetchStatusCount("DELIVERED"),
      ]);

      setKpiCounts({
        pending,
        processing,
        completed,
        delivered,
      });
    } catch {
      // Keep existing KPI values if this background refresh fails.
    }
  }, []);

  useEffect(() => {
    loadRepairs();
    loadKpiCounts();
  }, [loadRepairs, loadKpiCounts]);

  useEffect(() => {
    setTotalAmount(String(computedTotalAmount));
  }, [computedTotalAmount]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const loadRepairTypes = useCallback(async () => {
    if (!showRepairTypes) {
      return;
    }
    setRepairTypeLoading(true);
    setRepairTypeError(null);
    try {
      const params = new URLSearchParams({
        page: String(repairTypePage),
        pageSize: String(repairTypePageSize),
      });
      if (repairTypeSearch.trim()) {
        params.set("search", repairTypeSearch.trim());
      }
      const response = await fetch(`/api/repair-types?${params.toString()}`);
      const payload = (await response.json()) as {
        success: boolean;
        data: { items: RepairTypeItem[]; total: number } | null;
        message: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to load repair types.");
      }
      setRepairTypes(payload.data.items);
      setRepairTypeTotal(payload.data.total);
    } catch (err) {
      setRepairTypeError(
        err instanceof Error ? err.message : "Unable to load repair types."
      );
    } finally {
      setRepairTypeLoading(false);
    }
  }, [repairTypePage, repairTypePageSize, repairTypeSearch, showRepairTypes]);

  useEffect(() => {
    loadRepairTypes();
  }, [loadRepairTypes]);

  useEffect(() => {
    if (!showRepairTypes) {
      return;
    }
    setRepairTypePage(1);
  }, [showRepairTypes, repairTypeSearch]);

  useEffect(() => {
    const shouldLock =
      isModalOpen ||
      confirmOpen ||
      statusConfirmOpen ||
      deleteConfirmOpen ||
      repairTypeDeleteOpen ||
      validationOpen ||
      clientCreateOpen ||
      brandCreateOpen;
    if (shouldLock) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [isModalOpen, confirmOpen, statusConfirmOpen, deleteConfirmOpen, repairTypeDeleteOpen, validationOpen, clientCreateOpen, brandCreateOpen]);

  useEffect(() => {
    if (!showCreateForm || editMode || viewMode) {
      return;
    }
    let active = true;
    async function loadBillNo() {
      setBillLoading(true);
      try {
        const response = await fetch("/api/repairs/next-bill");
        const payload = (await response.json()) as {
          success: boolean;
          data: { billNo: string } | null;
          message: string;
        };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load bill number.");
        }
        if (active) {
          setBillNo(payload.data.billNo);
        }
      } catch {
        if (active) {
          setBillNo("");
        }
      } finally {
        if (active) {
          setBillLoading(false);
        }
      }
    }

    loadBillNo();
    return () => {
      active = false;
    };
  }, [showCreateForm, editMode, viewMode]);

  useEffect(() => {
    if (!showCreateForm || !repairTypeOpenId) {
      return;
    }
    let active = true;
    const searchTerm = repairTypeSearchTerm.trim();
    const timeout = setTimeout(async () => {
      setRepairTypeOptionsLoading(true);
      try {
        const collected: RepairTypeItem[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 50;

        while (hasMore && page <= 20) {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
          });
          if (searchTerm) {
            params.set("search", searchTerm);
          }
          const response = await fetch(`/api/repair-types?${params.toString()}`);
          const payload = (await response.json()) as {
            success: boolean;
            data: { items: RepairTypeItem[]; total: number; pageSize: number } | null;
            message: string;
          };
          if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message || "Unable to load repair types.");
          }
          collected.push(...payload.data.items);
          const loaded = page * payload.data.pageSize;
          hasMore = loaded < payload.data.total;
          if (!searchTerm) {
            hasMore = false;
          }
          page += 1;
        }

        if (active) {
          setRepairTypeOptions(collected.filter((item) => item.isActive));
        }
      } catch {
        if (active) {
          setRepairTypeOptions([]);
        }
      } finally {
        if (active) {
          setRepairTypeOptionsLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [showCreateForm, repairTypeOpenId, repairTypeSearchTerm]);

  useEffect(() => {
    let active = true;
    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me");
        const payload = (await response.json()) as {
          success: boolean;
          data: { role: "SUPER_ADMIN" | "CASHIER" | "REPAIR_STAFF" } | null;
        };
        if (active && response.ok && payload.success && payload.data) {
          setCurrentRole(payload.data.role);
        }
      } catch {
        if (active) {
          setCurrentRole(null);
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!clientOpen) {
      return;
    }
    setClientPage(1);
  }, [clientOpen, clientSearch]);

  useEffect(() => {
    if (!clientOpen) {
      return;
    }
    const timeout = setTimeout(async () => {
      setClientError(null);
      const searchTerm = clientSearch.trim();

      if (searchTerm) {
        setClientLoading(true);
        try {
          const collected: ClientOption[] = [];
          let page = 1;
          let hasMore = true;
          const pageSize = 50;

          while (hasMore && page <= 20) {
            const params = new URLSearchParams({
              page: String(page),
              pageSize: String(pageSize),
              search: searchTerm,
            });
            const response = await fetch(`/api/clients?${params.toString()}`);
            const payload = (await response.json()) as {
              success: boolean;
              data: { items: ClientOption[]; total: number; page: number; pageSize: number } | null;
              message: string;
            };
            if (!response.ok || !payload.success || !payload.data) {
              throw new Error(payload.message || "Unable to load clients.");
            }
            collected.push(...payload.data.items);
            const loaded = page * payload.data.pageSize;
            hasMore = loaded < payload.data.total;
            page += 1;
          }

          setClients(collected);
          setClientHasMore(false);
        } catch (err) {
          setClientError(
            err instanceof Error ? err.message : "Unable to load clients."
          );
        } finally {
          setClientLoading(false);
          setClientLoadingMore(false);
        }
        return;
      }

      if (clientPage === 1) {
        setClientLoading(true);
      } else {
        setClientLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          page: String(clientPage),
          pageSize: "50",
        });
        const response = await fetch(`/api/clients?${params.toString()}`);
        const payload = (await response.json()) as {
          success: boolean;
          data: { items: ClientOption[]; total: number; page: number; pageSize: number } | null;
          message: string;
        };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load clients.");
        }
        const data = payload.data;
        setClients((prev) =>
          clientPage === 1 ? data.items : [...prev, ...data.items]
        );
        const loaded = clientPage * data.pageSize;
        setClientHasMore(loaded < data.total);
      } catch (err) {
        setClientError(
          err instanceof Error ? err.message : "Unable to load clients."
        );
      } finally {
        setClientLoading(false);
        setClientLoadingMore(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [clientOpen, clientPage, clientSearch, clientReloadToken]);

  function resetClientCreateForm() {
    setClientCreateName("");
    setClientCreateMobile("");
    setClientCreateTier("BRONZE");
    setClientCreateError(null);
  }

  async function handleCreateClientFromRepair() {
    const trimmedName = clientCreateName.trim();
    const mobileDigits = clientCreateMobile.replace(/\D/g, "").slice(0, 9);

    if (!trimmedName) {
      setClientCreateError("Customer name is required.");
      return;
    }

    if (mobileDigits.length !== 9) {
      setClientCreateError("Mobile number must be 9 digits.");
      return;
    }

    setClientCreateSaving(true);
    setClientCreateError(null);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          mobile: `94${mobileDigits}`,
          tier: clientCreateTier,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: ClientOption | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to create customer.");
      }

      try {
        const refreshParams = new URLSearchParams({
          page: "1",
          pageSize: "50",
        });
        const refreshResponse = await fetch(`/api/clients?${refreshParams.toString()}`);
        const refreshPayload = (await refreshResponse.json()) as {
          success: boolean;
          data: { items: ClientOption[]; total: number; pageSize: number } | null;
        };
        if (refreshResponse.ok && refreshPayload.success && refreshPayload.data) {
          setClients(refreshPayload.data.items);
          setClientHasMore(refreshPayload.data.pageSize < refreshPayload.data.total);
        }
      } catch {
        // Keep flow unblocked; created client is still selected below.
      }

      setSelectedClient(payload.data);
      setClientOpen(false);
      setClientSearch("");
      setClientPage(1);
      setClientReloadToken((value) => value + 1);
      setClientCreateOpen(false);
      resetClientCreateForm();
    } catch (err) {
      setClientCreateError(
        err instanceof Error ? err.message : "Unable to create customer."
      );
    } finally {
      setClientCreateSaving(false);
    }
  }

  function resetBrandCreateForm() {
    setBrandCreateName("");
    setBrandCreateError(null);
  }

  async function handleCreateBrandFromRepair() {
    const trimmedName = brandCreateName.trim();

    if (!trimmedName) {
      setBrandCreateError("Brand name is required.");
      return;
    }

    setBrandCreateSaving(true);
    setBrandCreateError(null);
    try {
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: BrandOption | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Unable to create brand.");
      }

      try {
        const refreshParams = new URLSearchParams({
          page: "1",
          pageSize: "50",
        });
        const refreshResponse = await fetch(`/api/brands?${refreshParams.toString()}`);
        const refreshPayload = (await refreshResponse.json()) as {
          success: boolean;
          data: { items: BrandOption[]; total: number; pageSize: number } | null;
        };
        if (refreshResponse.ok && refreshPayload.success && refreshPayload.data) {
          setBrands(refreshPayload.data.items);
          setBrandHasMore(refreshPayload.data.pageSize < refreshPayload.data.total);
        }
      } catch {
        // Keep flow unblocked; created brand is still selected below.
      }

      setSelectedBrand(payload.data);
      setBrandOpen(false);
      setBrandSearch("");
      setBrandPage(1);
      setBrandReloadToken((value) => value + 1);
      setBrandCreateOpen(false);
      resetBrandCreateForm();
    } catch (err) {
      setBrandCreateError(
        err instanceof Error ? err.message : "Unable to create brand."
      );
    } finally {
      setBrandCreateSaving(false);
    }
  }

  useEffect(() => {
    if (!brandOpen) {
      return;
    }
    setBrandPage(1);
  }, [brandOpen, brandSearch]);

  useEffect(() => {
    if (!brandOpen) {
      return;
    }
    const timeout = setTimeout(async () => {
      setBrandError(null);
      const searchTerm = brandSearch.trim();

      if (searchTerm) {
        setBrandLoading(true);
        try {
          const collected: BrandOption[] = [];
          let page = 1;
          let hasMore = true;
          const pageSize = 50;

          while (hasMore && page <= 20) {
            const params = new URLSearchParams({
              page: String(page),
              pageSize: String(pageSize),
              search: searchTerm,
            });
            const response = await fetch(`/api/brands?${params.toString()}`);
            const payload = (await response.json()) as {
              success: boolean;
              data: { items: BrandOption[]; total: number; page: number; pageSize: number } | null;
              message: string;
            };
            if (!response.ok || !payload.success || !payload.data) {
              throw new Error(payload.message || "Unable to load brands.");
            }
            collected.push(...payload.data.items);
            const loaded = page * payload.data.pageSize;
            hasMore = loaded < payload.data.total;
            page += 1;
          }

          setBrands(collected);
          setBrandHasMore(false);
        } catch (err) {
          setBrandError(
            err instanceof Error ? err.message : "Unable to load brands."
          );
        } finally {
          setBrandLoading(false);
          setBrandLoadingMore(false);
        }
        return;
      }

      if (brandPage === 1) {
        setBrandLoading(true);
      } else {
        setBrandLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          page: String(brandPage),
          pageSize: "50",
        });
        const response = await fetch(`/api/brands?${params.toString()}`);
        const payload = (await response.json()) as {
          success: boolean;
          data: { items: BrandOption[]; total: number; page: number; pageSize: number } | null;
          message: string;
        };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load brands.");
        }
        const data = payload.data;
        setBrands((prev) =>
          brandPage === 1 ? data.items : [...prev, ...data.items]
        );
        const loaded = brandPage * data.pageSize;
        setBrandHasMore(loaded < data.total);
      } catch (err) {
        setBrandError(
          err instanceof Error ? err.message : "Unable to load brands."
        );
      } finally {
        setBrandLoading(false);
        setBrandLoadingMore(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [brandOpen, brandPage, brandSearch, brandReloadToken]);

  useEffect(() => {
    if (!storeOpen) {
      return;
    }
    setStorePage(1);
  }, [storeOpen, storeSearch]);

  useEffect(() => {
    if (!storeOpen) {
      return;
    }
    const timeout = setTimeout(async () => {
      setStoreError(null);
      const searchTerm = storeSearch.trim();

      if (searchTerm) {
        setStoreLoading(true);
        try {
          const collected: StoreOption[] = [];
          let page = 1;
          let hasMore = true;
          const pageSize = 50;

          while (hasMore && page <= 20) {
            const params = new URLSearchParams({
              page: String(page),
              pageSize: String(pageSize),
              search: searchTerm,
            });
            const response = await fetch(`/api/stores?${params.toString()}`);
            const payload = (await response.json()) as {
              success: boolean;
              data: { items: StoreOption[]; total: number; page: number; pageSize: number } | null;
              message: string;
            };
            if (!response.ok || !payload.success || !payload.data) {
              throw new Error(payload.message || "Unable to load stores.");
            }
            collected.push(...payload.data.items);
            const loaded = page * payload.data.pageSize;
            hasMore = loaded < payload.data.total;
            page += 1;
          }

          setStores(collected);
          setStoreHasMore(false);
        } catch (err) {
          setStoreError(
            err instanceof Error ? err.message : "Unable to load stores."
          );
        } finally {
          setStoreLoading(false);
          setStoreLoadingMore(false);
        }
        return;
      }

      if (storePage === 1) {
        setStoreLoading(true);
      } else {
        setStoreLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          page: String(storePage),
          pageSize: "50",
        });
        const response = await fetch(`/api/stores?${params.toString()}`);
        const payload = (await response.json()) as {
          success: boolean;
          data: { items: StoreOption[]; total: number; page: number; pageSize: number } | null;
          message: string;
        };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load stores.");
        }
        const data = payload.data;
        setStores((prev) =>
          storePage === 1 ? data.items : [...prev, ...data.items]
        );
        const loaded = storePage * data.pageSize;
        setStoreHasMore(loaded < data.total);
      } catch (err) {
        setStoreError(
          err instanceof Error ? err.message : "Unable to load stores."
        );
      } finally {
        setStoreLoading(false);
        setStoreLoadingMore(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [storeOpen, storePage, storeSearch]);

  function resetRepairForm() {
    setBillNo("");
    setTrackingToken("");
    setSelectedClient(null);
    setClientSearch("");
    setClientOpen(false);
    setSelectedBrand(null);
    setBrandSearch("");
    setBrandOpen(false);
    setBrandCreateOpen(false);
    setBrandCreateName("");
    setBrandCreateError(null);
    setIntakeType("Walk-in");
    setIntakeOpen(false);
    setSelectedStore(null);
    setStoreSearch("");
    setStoreOpen(false);
    setTotalAmount("");
    setPhysicalBillNo("");
    setAdvanceAmount("");
    setSelectedDate("");
    setDescription("");
    setCreateError(null);
    setViewMode(false);
    setEditMode(false);
    setEditingRepairId(null);
    setInitialDeliveryDate(null);
    setRepairItems([{ id: "item-1", repairTypeId: "", repairTypeName: "", price: "" }]);
    setRepairTypeOpenId(null);
    setRepairTypeSearchTerm("");
    setEditSnapshot(null);
  }

  function resetRepairTypeForm() {
    setRepairTypeName("");
    setRepairTypeCode("");
    setRepairTypeEditingId(null);
  }

  function updateRepairItem(
    id: string,
    updates: Partial<Pick<RepairLineItem, "repairTypeId" | "repairTypeName" | "price">>
  ) {
    setRepairItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  function addRepairItem() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `item-${Date.now()}`;
    setRepairItems((prev) => [
      ...prev,
      { id, repairTypeId: "", repairTypeName: "", price: "" },
    ]);
    setRepairTypeSearchTerm("");
  }

  function removeRepairItem(id: string) {
    setRepairItems((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((item) => item.id !== id);
    });
    if (repairTypeOpenId === id) {
      setRepairTypeOpenId(null);
    }
  }

  function intakeToApi(value: string) {
    return value === "Courier" ? "Courier" : "Walk-in";
  }

  function validateRepairForm(): string | null {
    if (!billNo.trim()) {
      return "Bill number is loading. Please try again in a moment.";
    }
    if (!selectedClient) {
      return "Client is required.";
    }
    if (!selectedBrand) {
      return "Bat brand is required.";
    }
    if (!selectedStore) {
      return "Store is required.";
    }
    if (!selectedDate) {
      return "Estimated delivery date is required.";
    }
    const hasSelectedItem = repairItems.some((item) => item.repairTypeId);
    if (!hasSelectedItem) {
      return "At least one repair item is required.";
    }
    const hasBlankTypeItem = repairItems.some((item) => !item.repairTypeId.trim());
    if (hasBlankTypeItem) {
      return "Each repair row must have a repair type selected or be removed.";
    }
    const hasIncompleteItem = repairItems.some(
      (item) =>
        (item.repairTypeId &&
          (item.price === "" ||
            !Number.isFinite(Number(item.price)) ||
            Number(item.price) < 0)) ||
        (!item.repairTypeId && item.price)
    );
    if (hasIncompleteItem) {
      return "Each selected repair item must have a valid price (0 or more).";
    }
    return null;
  }

  function nextStatus(status: RepairItem["status"]) {
    switch (status) {
      case "PENDING":
        return "PROCESSING";
      case "PROCESSING":
        return "REPAIR_COMPLETED";
      case "REPAIR_COMPLETED":
        return "DELIVERED";
      default:
        return null;
    }
  }

  async function handleCreateRepair() {
    const validation = validateRepairForm();
    if (validation) {
      setValidationMessage(validation);
      setValidationOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function handleSaveRepairType() {
    if (!repairTypeName.trim() || !repairTypeCode.trim()) {
      setRepairTypeError("Repair type name and code are required.");
      return;
    }

    setRepairTypeSaving(true);
    setRepairTypeError(null);
    try {
      const payload = {
        name: repairTypeName.trim(),
        code: repairTypeCode.trim(),
        ...(repairTypeEditingId ? { id: repairTypeEditingId } : {}),
      };
      const response = await fetch("/api/repair-types", {
        method: repairTypeEditingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save repair type.");
      }
      resetRepairTypeForm();
      await loadRepairTypes();
    } catch (err) {
      setRepairTypeError(
        err instanceof Error ? err.message : "Unable to save repair type."
      );
    } finally {
      setRepairTypeSaving(false);
    }
  }

  async function confirmDeleteRepairType() {
    if (!pendingRepairTypeDelete) {
      return;
    }
    setRepairTypeSaving(true);
    try {
      const response = await fetch("/api/repair-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingRepairTypeDelete.id }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data?: { id: string } | null;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to delete repair type.");
      }
      setRepairTypeDeleteOpen(false);
      setPendingRepairTypeDelete(null);
      await loadRepairTypes();
    } catch (err) {
      setRepairTypeError(
        err instanceof Error ? err.message : "Unable to delete repair type."
      );
    } finally {
      setRepairTypeSaving(false);
    }
  }

  async function confirmCreateRepair() {
    if (!selectedClient || !selectedBrand || !selectedStore) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const primaryRepairTypeId =
        repairItems.find((item) => item.repairTypeId)?.repairTypeId ?? null;
      const itemsPayload = repairItems
        .filter(
          (item) =>
            item.repairTypeId &&
            item.price !== "" &&
            Number.isFinite(Number(item.price)) &&
            Number(item.price) >= 0
        )
        .map((item) => ({
          repairTypeId: item.repairTypeId,
          price: Number(item.price),
        }));
      const response = await fetch("/api/repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billNo: billNo.trim(),
          clientId: selectedClient.id,
          brandId: selectedBrand.id,
          intakeType: intakeToApi(intakeType),
          storeId: selectedStore.id,
          physicalBillNo: physicalBillNo.trim() || null,
          repairTypeId: primaryRepairTypeId,
          items: itemsPayload,
          totalAmount: computedTotalAmount,
          advanceAmount: Number(advanceAmount || 0),
          estimatedDeliveryDate: selectedDate,
          description: description.trim() ? description.trim() : null,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data?: { id: string } | null;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to create repair.");
      }
      const autoPrintRepair: RepairItem = {
        id: payload.data?.id ?? `tmp-${Date.now()}`,
        billNo,
        physicalBillNo: physicalBillNo.trim() || null,
        intakeType: intakeType === "Courier" ? "COURIER" : "WALK_IN",
        createdAt: new Date().toISOString(),
        totalAmount: computedTotalAmount,
        advanceAmount: Number(advanceAmount || 0),
        estimatedDeliveryDate: selectedDate,
        description: description.trim() ? description.trim() : null,
        status: "PENDING",
        isPostponed: false,
        client: {
          id: selectedClient.id,
          name: selectedClient.name,
          mobile: selectedClient.mobile,
        },
        brand: {
          id: selectedBrand.id,
          name: selectedBrand.name,
        },
        store: {
          id: selectedStore.id,
          name: selectedStore.name,
        },
        items: repairItems
          .filter(
            (item) =>
              item.repairTypeId &&
              item.price !== "" &&
              Number.isFinite(Number(item.price)) &&
              Number(item.price) >= 0
          )
          .map((item, index) => ({
            id: item.id || `item-${index + 1}`,
            repairTypeId: item.repairTypeId,
            price: Number(item.price),
            repairType: item.repairTypeName
              ? {
                  id: item.repairTypeId,
                  code: item.repairTypeName.split(" - ")[0] || "",
                  name:
                    item.repairTypeName.split(" - ").slice(1).join(" - ") ||
                    item.repairTypeName,
                }
              : null,
          })),
      };
      printRepairReceipt(buildReceiptPayloadWithCopyType(autoPrintRepair, "CUSTOMER"));
      const smsFailed =
        payload.message.toLowerCase().includes("sms") &&
        payload.message.toLowerCase().includes("failed");
      setToast({
        tone: smsFailed ? "error" : "success",
        message: payload.message || "Repair created.",
      });
      setConfirmOpen(false);
      setShowCreateForm(false);
      resetRepairForm();
      setRepairsPage(1);
      loadRepairs();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Unable to create repair."
      );
      setConfirmOpen(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateRepair() {
    if (!editingRepairId || !selectedBrand || !selectedStore) {
      return;
    }
    if (isEditUnchanged) {
      setValidationMessage("No changes detected to update.");
      setValidationOpen(true);
      return;
    }
    const validation = validateRepairForm();
    if (validation) {
      setValidationMessage(validation);
      setValidationOpen(true);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const primaryRepairTypeId =
        repairItems.find((item) => item.repairTypeId)?.repairTypeId ?? null;
      const itemsPayload = repairItems
        .filter(
          (item) =>
            item.repairTypeId &&
            item.price !== "" &&
            Number.isFinite(Number(item.price)) &&
            Number(item.price) >= 0
        )
        .map((item) => ({
          repairTypeId: item.repairTypeId,
          price: Number(item.price),
        }));
      const response = await fetch("/api/repairs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRepairId,
          billNo: billNo.trim(),
          brandId: selectedBrand.id,
          intakeType: intakeToApi(intakeType),
          storeId: selectedStore.id,
          physicalBillNo: physicalBillNo.trim() || null,
          repairTypeId: primaryRepairTypeId,
          items: itemsPayload,
          totalAmount: computedTotalAmount,
          advanceAmount: Number(advanceAmount || 0),
          estimatedDeliveryDate: selectedDate,
          description: description.trim() ? description.trim() : null,
          isPostponed: initialDeliveryDate
            ? selectedDate !== initialDeliveryDate
            : null,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data?: { id: string } | null;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to update repair.");
      }
      const smsFailed =
        payload.message.toLowerCase().includes("sms") &&
        payload.message.toLowerCase().includes("failed");
      setToast({
        tone: smsFailed ? "error" : "success",
        message: payload.message || "Repair updated successfully.",
      });
      setSuccessMessage(payload.message || "Repair updated successfully.");
      setTimeout(() => {
        setSuccessMessage(null);
        setIsModalOpen(false);
        setShowCreateForm(false);
        resetRepairForm();
        loadRepairs();
      }, 2500);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Unable to update repair."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusAdvance(repair: RepairItem) {
    const next = nextStatus(repair.status);
    if (!next) {
      return;
    }
    setPendingStatusRepair(repair);
    setStatusConfirmOpen(true);
  }

  async function confirmStatusAdvance() {
    if (!pendingStatusRepair) {
      return;
    }
    const next = nextStatus(pendingStatusRepair.status);
    if (!next) {
      return;
    }
    setStatusUpdatingId(pendingStatusRepair.id);
    try {
      const response = await fetch("/api/repairs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingStatusRepair.id,
          status: next,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to update status.");
      }
      const smsFailed =
        payload.message.toLowerCase().includes("sms") &&
        payload.message.toLowerCase().includes("failed");
      setToast({
        tone: smsFailed ? "error" : "success",
        message: payload.message || "Status updated.",
      });
      setStatusConfirmOpen(false);
      setPendingStatusRepair(null);
      loadRepairs();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to update status.";
      setRepairsError(message);
      setToast({
        tone: "error",
        message,
      });
    } finally {
      setStatusUpdatingId(null);
    }
  }

  async function confirmDeleteRepair() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch("/api/repairs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to delete repair.");
      }
      setDeleteConfirmOpen(false);
      setPendingDelete(null);
      loadRepairs();
    } catch (err) {
      setRepairsError(
        err instanceof Error ? err.message : "Unable to delete repair."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Operations
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Repairs</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Intake, track, and deliver repair jobs with strict status flow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showRepairTypes ? (
            <button
              className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-5 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
              onClick={() => setShowRepairTypes(false)}
            >
              Back to Repairs
            </button>
          ) : showCreateForm ? (
            <button
              className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-5 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
              onClick={() => {
                setShowCreateForm(false);
                resetRepairForm();
              }}
            >
              Back to Repairs
            </button>
          ) : (
            <>
              <button
                className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                onClick={() => {
                  setShowCreateForm(false);
                  setShowRepairTypes(true);
                }}
              >
                Repair Types
              </button>
              <button
                className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:opacity-90"
                onClick={() => {
                  setCreateError(null);
                  setShowRepairTypes(false);
                  setShowCreateForm(true);
                }}
              >
                Create Repair Job
              </button>
            </>
          )}
        </div>
      </header>

      {showRepairTypes ? (
        <div className="grid gap-6">
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Repair Types
                </p>
                <h3 className="mt-2 text-xl font-semibold">Add a new repair type</h3>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr_auto]">
              <input
                className="h-12 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Repair name"
                value={repairTypeName}
                onChange={(event) => setRepairTypeName(event.target.value)}
                disabled={repairTypeSaving}
              />
              <input
                className="h-12 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Code"
                value={repairTypeCode}
                onChange={(event) => setRepairTypeCode(event.target.value)}
                disabled={repairTypeSaving}
              />
              <button
                className="h-10 rounded-full bg-[var(--accent)] px-6 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handleSaveRepairType}
                disabled={
                  repairTypeSaving ||
                  !repairTypeName.trim() ||
                  !repairTypeCode.trim()
                }
              >
                Save
              </button>
            </div>
            {repairTypeEditingId ? (
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                Editing selected type. Update the name or code and press Save.
              </div>
            ) : null}
            {repairTypeError ? (
              <div className="mt-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
                {repairTypeError}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Types List
                </p>
                <h3 className="mt-2 text-xl font-semibold">Active repair types</h3>
              </div>
              <input
                className="h-10 w-56 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Search type"
                value={repairTypeSearch}
                onChange={(event) => setRepairTypeSearch(event.target.value)}
              />
            </div>

            <div className="mt-6 grid gap-3">
              {repairTypeLoading ? (
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-xs text-[var(--text-muted)]">
                  Loading repair types...
                </div>
              ) : repairTypes.length === 0 ? (
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-xs text-[var(--text-muted)]">
                  No repair types found.
                </div>
              ) : (
                repairTypes.map((type) => (
                  <div
                    key={type.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-4 text-sm"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        {type.code}
                      </p>
                      <p className="mt-1 font-semibold">{type.name}</p>
                      {!type.isActive ? (
                        <p className="mt-1 text-xs text-rose-300">Inactive</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)]"
                        onClick={() => {
                          setRepairTypeEditingId(type.id);
                          setRepairTypeName(type.name);
                          setRepairTypeCode(type.code);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-200 transition hover:bg-rose-500/20"
                        onClick={() => {
                          setPendingRepairTypeDelete(type);
                          setRepairTypeDeleteOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <div>
                Showing{" "}
                <span className="text-[var(--foreground)]">
                  {repairTypes.length}
                </span>{" "}
                of {repairTypeTotal}
              </div>
              <div className="flex items-center gap-2">
                <div>
                  Page{" "}
                  <span className="text-[var(--foreground)]">
                    {repairTypePage}
                  </span>{" "}
                  of {totalRepairTypePages}
                </div>
                <button
                  className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
                  onClick={() => setRepairTypePage((prev) => Math.max(1, prev - 1))}
                  disabled={repairTypePage <= 1}
                >
                  Prev
                </button>
                <button
                  className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
                  onClick={() =>
                    setRepairTypePage((prev) => Math.min(totalRepairTypePages, prev + 1))
                  }
                  disabled={repairTypePage >= totalRepairTypePages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : showCreateForm ? null : (
        <>
        <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Pending
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {kpiCounts.pending}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Intake awaiting start.
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Processing
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {kpiCounts.processing}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Active bench work.
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Completed
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {kpiCounts.completed}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Ready for delivery.
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Delivered
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {kpiCounts.delivered}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Hidden from main list.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Repair queue
            </p>
            <h3 className="mt-2 text-xl font-semibold">Active jobs</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 w-56 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Search bill, client, brand"
              value={repairsSearch}
              onChange={(event) => {
                setRepairsSearch(event.target.value);
                setRepairsPage(1);
              }}
            />
            <button className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]">
              Status: {statusFilter === "ACTIVE" ? "Active" : statusFilter}
            </button>
            <button className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]">
              Store: All
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {["ACTIVE", "ALL", "PENDING", "PROCESSING", "REPAIR_COMPLETED", "DELIVERED"].map(
            (status) => (
              <button
                key={status}
                className={`h-8 rounded-full border px-3 text-[10px] uppercase tracking-[0.2em] transition ${
                  statusFilter === status
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                }`}
                onClick={() => {
                  setStatusFilter(status);
                  setRepairsPage(1);
                }}
              >
                {status === "REPAIR_COMPLETED"
                  ? "Completed"
                  : status === "ACTIVE"
                    ? "Active"
                    : status}
              </button>
            )
          )}
        </div>

        {repairsError ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
            {repairsError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {repairsLoading ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Loading repairs...
            </div>
          ) : repairs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No repairs found.
            </div>
          ) : (
            repairs.map((repair) => (
              <div
                key={repair.id}
                className="grid gap-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-4 text-sm lg:grid-cols-[1.2fr_1fr_0.9fr_1fr_1fr_0.7fr]"
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {repair.billNo}
                  </p>
                  <p className="mt-1 font-semibold">{repair.client.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {repair.brand.name} ·{" "}
                    {repair.intakeType === "COURIER" ? "Courier" : "Walk-in"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Store: {repair.store.name}
                  </p>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  <p>Total: LKR {repair.totalAmount.toLocaleString()}</p>
                  <p className="mt-1">
                    Advance: LKR {repair.advanceAmount.toLocaleString()}
                  </p>
                  <p className="mt-1">
                    ETA: {new Date(repair.estimatedDeliveryDate).toLocaleDateString()}
                  </p>
                  <p className="mt-1">
                    Created:{" "}
                    {repair.createdAt
                      ? new Date(repair.createdAt).toLocaleDateString()
                      : "-"}
                  </p>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  <p>Status</p>
                  <span
                    className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      statusMeta[repair.status]?.className ??
                      "bg-zinc-400/15 text-zinc-400"
                    }`}
                  >
                    {statusMeta[repair.status]?.label ?? repair.status}
                  </span>
                  {repair.isPostponed ? (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-amber-400">
                      Postponed
                    </p>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  <p>Actions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-full border border-[var(--stroke)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)] disabled:opacity-60"
                      onClick={() => handleStatusAdvance(repair)}
                      disabled={
                        repair.status === "DELIVERED" || statusUpdatingId === repair.id
                      }
                    >
                      {statusUpdatingId === repair.id ? "Updating..." : "Update Status"}
                    </button>
                    <button
                      className="h-9 rounded-full border border-[var(--stroke)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        const mappedItems =
                          repair.items && repair.items.length > 0
                            ? repair.items.map((item, index) => ({
                                id: item.id || `item-${index + 1}`,
                                repairTypeId: item.repairTypeId,
                                repairTypeName: item.repairType
                                  ? `${item.repairType.code} - ${item.repairType.name}`
                                  : "",
                                price: String(item.price),
                              }))
                            : [
                                {
                                  id: "item-1",
                                  repairTypeId: repair.repairTypeId ?? "",
                                  repairTypeName: "",
                                  price: String(repair.totalAmount),
                                },
                              ];
                        const dateValue = new Date(repair.estimatedDeliveryDate)
                          .toISOString()
                          .slice(0, 10);

                        setShowCreateForm(true);
                        setEditMode(true);
                        setViewMode(false);
                        setEditingRepairId(repair.id);
                        setBillNo(repair.billNo);
                        setTrackingToken(repair.trackingToken ?? "");
                        setSelectedClient({
                          id: repair.client.id,
                          name: repair.client.name,
                          mobile: repair.client.mobile,
                        });
                        setSelectedBrand({
                          id: repair.brand.id,
                          name: repair.brand.name,
                        });
                        setSelectedStore({
                          id: repair.store.id,
                          name: repair.store.name,
                        });
                        setIntakeType(
                          repair.intakeType === "COURIER" ? "Courier" : "Walk-in"
                        );
                        setTotalAmount(String(repair.totalAmount));
                        setPhysicalBillNo(repair.physicalBillNo ?? "");
                        setAdvanceAmount(String(repair.advanceAmount));
                        setRepairItems(mappedItems);
                        setSelectedDate(dateValue);
                        setInitialDeliveryDate(dateValue);
                        setDescription(repair.description ?? "");
                        setEditSnapshot({
                          intakeType:
                            repair.intakeType === "COURIER" ? "Courier" : "Walk-in",
                          selectedDate: dateValue,
                          physicalBillNo: (repair.physicalBillNo ?? "").trim(),
                          advanceAmount: String(Number(repair.advanceAmount || 0)),
                          description: (repair.description ?? "").trim(),
                          itemsSignature: createItemsSignature(mappedItems),
                        });
                        setIsModalOpen(false);
                      }}
                      disabled={repair.status === "DELIVERED"}
                    >
                      Edit/Reschedule
                    </button>
                  </div>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  <p>Print</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-full border border-[var(--stroke)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                      onClick={() => {
                        printRepairReceipt(
                          buildReceiptPayloadWithCopyType(repair, "CUSTOMER")
                        );
                      }}
                    >
                      Customer Copy
                    </button>
                    <button
                      className="h-9 rounded-full border border-[var(--stroke)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                      onClick={() => {
                        printRepairReceipt(
                          buildReceiptPayloadWithCopyType(repair, "REPAIR")
                        );
                      }}
                    >
                      Repair Copy
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)]"
                      onClick={() => {
                      setShowCreateForm(true);
                      setViewMode(true);
                      setBillNo(repair.billNo);
                      setTrackingToken(repair.trackingToken ?? "");
                      setSelectedClient({
                        id: repair.client.id,
                        name: repair.client.name,
                        mobile: repair.client.mobile,
                      });
                      setSelectedBrand({
                        id: repair.brand.id,
                        name: repair.brand.name,
                      });
                      setSelectedStore({
                        id: repair.store.id,
                        name: repair.store.name,
                      });
                      setIntakeType(
                        repair.intakeType === "COURIER" ? "Courier" : "Walk-in"
                      );
                      setTotalAmount(String(repair.totalAmount));
                      setPhysicalBillNo(repair.physicalBillNo ?? "");
                      setAdvanceAmount(String(repair.advanceAmount));
                      if (repair.items && repair.items.length > 0) {
                        setRepairItems(
                          repair.items.map((item, index) => ({
                            id: item.id || `item-${index + 1}`,
                            repairTypeId: item.repairTypeId,
                            repairTypeName: item.repairType
                              ? `${item.repairType.code} - ${item.repairType.name}`
                              : "",
                            price: String(item.price),
                          }))
                        );
                      } else {
                        setRepairItems([
                          {
                            id: "item-1",
                            repairTypeId: repair.repairTypeId ?? "",
                            repairTypeName: "",
                            price: String(repair.totalAmount),
                          },
                        ]);
                      }
                      setSelectedDate(
                        new Date(repair.estimatedDeliveryDate)
                          .toISOString()
                          .slice(0, 10)
                      );
                      setDescription(repair.description ?? "");
                      setEditMode(false);
                      setIsModalOpen(false);
                    }}
                  >
                    View
                  </button>
                  {currentRole === "SUPER_ADMIN" ? (
                    <button
                      className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-200 transition hover:bg-rose-500/20"
                      onClick={() => {
                        setPendingDelete(repair);
                        setDeleteConfirmOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-1">
              {repairs.length} of {repairsTotal}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div>
              Page{" "}
              <span className="text-[var(--foreground)]">{repairsPage}</span> of{" "}
              {totalRepairPages}
            </div>
            <button
              className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
              onClick={() => setRepairsPage((prev) => Math.max(1, prev - 1))}
              disabled={repairsPage <= 1}
            >
              Prev
            </button>
            <button
              className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
              onClick={() => setRepairsPage((prev) => Math.min(totalRepairPages, prev + 1))}
              disabled={repairsPage >= totalRepairPages}
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-muted)]">
            Status flow: PENDING → PROCESSING → REPAIR_COMPLETED → DELIVERED.
            Delivered jobs stay in the database and are hidden from the main list.
          </div>
          <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-muted)]">
            SMS + Audit: A tracking token is generated at intake, SMS queued, and
            every change is logged (status, reschedule, SMS events).
          </div>
        </div>
      </div>
        </>
      )}

      {showCreateForm || isModalOpen ? (
        <div
          className={
            showCreateForm
              ? ""
              : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          }
        >
          <div
            className={
              showCreateForm
                ? "w-full rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6"
                : "w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-2xl"
            }
          >
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                {viewMode ? "Repair Summary" : editMode ? "Update Repair" : "New Repair"}
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {viewMode
                  ? "Repair job details"
                  : editMode
                    ? "Edit repair job"
                    : "Create repair job"}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {viewMode
                  ? "Review the bill, client details, and status for this repair."
                  : "Required fields generate bill, tracking token, and SMS queue."}
              </p>
            </div>

            <form className="mt-6 grid gap-4">
              {createError ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {createError}
                </div>
              ) : null}
              {successMessage ? (
                <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                  {successMessage}
                </div>
              ) : null}
              {editMode && !viewMode ? (
                <>
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Bill number
                        </p>
                        <p className="mt-2 font-semibold">{billNo || "-"}</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Client
                        </p>
                        <p className="mt-2 font-semibold">
                          {selectedClient
                            ? `${selectedClient.name} - ${formatMobile(
                                selectedClient.mobile
                              )}`
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Bat brand
                        </p>
                        <p className="mt-2 font-semibold">
                          {selectedBrand?.name ?? "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Intake type
                        </p>
                        <div className="relative mt-2">
                          <button
                            type="button"
                            className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-3 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                            onClick={() => setIntakeOpen((prev) => !prev)}
                            aria-expanded={intakeOpen}
                          >
                            <span>{intakeType}</span>
                            <span className="text-xs text-[var(--text-muted)]">v</span>
                          </button>
                          {intakeOpen ? (
                            <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                              {["Walk-in", "Courier"].map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                    intakeType === option
                                      ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                      : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                  }`}
                                  onClick={() => {
                                    setIntakeType(option);
                                    setIntakeOpen(false);
                                  }}
                                >
                                  <span>{option}</span>
                                  {intakeType === option ? (
                                    <span className="text-xs text-[var(--text-muted)]">
                                      Selected
                                    </span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Store
                        </p>
                        <p className="mt-2 font-semibold">
                          {selectedStore?.name ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Estimated delivery
                        </p>
                        <div className="mt-2">
                          <DeliveryDatePicker
                            value={selectedDate}
                            onChange={setSelectedDate}
                            countsByDate={deliveryCounts}
                            disabled={viewMode}
                            onMonthChange={handleCalendarMonthChange}
                            loading={calendarLoading}
                          />
                        </div>
                      </div>
                      <label className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                        <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Physical bill no (optional)
                        </span>
                        <input
                          className="mt-2 h-10 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                          placeholder="Enter physical bill no"
                          value={physicalBillNo}
                          onChange={(event) => setPhysicalBillNo(event.target.value)}
                          maxLength={50}
                        />
                      </label>
                    </div>
                  </div>
                  {calendarError ? (
                    <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                      {calendarError}
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Repair items
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          Add one or more repair items to build the bill.
                        </p>
                      </div>
                      {!viewMode ? (
                        <button
                          type="button"
                          className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:border-[var(--accent)]"
                          onClick={addRepairItem}
                        >
                          Add Repair
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {repairItems.map((item) => (
                        <div
                          key={item.id}
                          className="grid gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-3 md:grid-cols-[1.2fr_0.6fr_auto]"
                        >
                          <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            <span>Repair type</span>
                            <div className="relative">
                              <button
                                type="button"
                                className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                                onClick={() => {
                                  if (!viewMode && !repairTypeOptionsLoading) {
                                    setRepairTypeOpenId((prev) =>
                                      prev === item.id ? null : item.id
                                    );
                                    setRepairTypeSearchTerm("");
                                  }
                                }}
                                aria-expanded={repairTypeOpenId === item.id}
                                disabled={viewMode || repairTypeOptionsLoading}
                              >
                                <span>
                                  {item.repairTypeName ||
                                    (repairTypeOptionsLoading
                                      ? "Loading types..."
                                      : "Select repair type")}
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)]">v</span>
                              </button>
                              {repairTypeOpenId === item.id ? (
                                <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                                  <div className="p-2">
                                    <input
                                      className="h-9 w-full rounded-lg border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                                      placeholder="Search repair types"
                                      value={repairTypeSearchTerm}
                                      onChange={(event) =>
                                        setRepairTypeSearchTerm(event.target.value)
                                      }
                                    />
                                  </div>
                                  {repairTypeOptionsLoading ? (
                                    <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                      Loading repair types...
                                    </div>
                                  ) : repairTypeOptions.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                      No types found.
                                    </div>
                                  ) : (
                                    repairTypeOptions.map((option) => (
                                      <button
                                        key={option.id}
                                        type="button"
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                          option.id === item.repairTypeId
                                            ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                            : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                        }`}
                                        onClick={() => {
                                          updateRepairItem(item.id, {
                                            repairTypeId: option.id,
                                            repairTypeName: `${option.code} - ${option.name}`,
                                          });
                                          setRepairTypeOpenId(null);
                                          setRepairTypeSearchTerm("");
                                        }}
                                      >
                                        <span>{option.code} - {option.name}</span>
                                        {option.id === item.repairTypeId ? (
                                          <span className="text-[10px] text-[var(--text-muted)]">
                                            Selected
                                          </span>
                                        ) : null}
                                      </button>
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            <span>Price</span>
                            <input
                              className="h-10 rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                              placeholder="xxxx"
                              type="text"
                              inputMode="numeric"
                              pattern="\\d*"
                              value={item.price}
                              onChange={(event) => {
                                event.currentTarget.value =
                                  event.currentTarget.value.replace(/\\D/g, "");
                                updateRepairItem(item.id, {
                                  price: event.currentTarget.value,
                                });
                              }}
                              disabled={viewMode}
                            />
                          </label>
                          <div className="flex items-end justify-end">
                            {!viewMode ? (
                              <button
                                type="button"
                                className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-[10px] uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/20"
                                onClick={() => removeRepairItem(item.id)}
                                disabled={repairItems.length <= 1}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-end justify-end gap-4 text-xs text-[var(--text-muted)]">
                      <label className="grid gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        <span>Advance</span>
                        <div className="relative w-32">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
                            LKR
                          </span>
                          <input
                            className="h-9 w-full rounded-full border border-[var(--stroke)] bg-[var(--panel)] pl-10 pr-4 text-xs text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                            placeholder="xxxx"
                            type="text"
                            inputMode="numeric"
                            pattern="\\d*"
                            onChange={(event) => {
                              event.currentTarget.value =
                                event.currentTarget.value.replace(/\\D/g, "");
                              setAdvanceAmount(event.currentTarget.value);
                            }}
                            value={advanceAmount}
                            disabled={viewMode}
                          />
                        </div>
                      </label>
                      <div className="grid gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        <span>Total amount</span>
                        <span className="flex h-9 min-w-[8rem] items-center rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--foreground)]">
                          LKR {computedTotalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-muted)]">
                    Tracking token (8-12 chars) will be generated on save, stored as a
                    hash, and disabled after delivery.
                  </div>
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Description
                    <textarea
                      className="min-h-[96px] rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      placeholder="Add repair notes, issues, or special instructions."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={viewMode}
                    />
                  </label>
                </>
              ) : null}
              {viewMode ? (
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Bill number
                      </p>
                      <p className="mt-2 font-semibold">{billNo || "—"}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Client
                      </p>
                      <p className="mt-2 font-semibold">
                        {selectedClient
                          ? `${selectedClient.name} · ${formatMobile(
                              selectedClient.mobile
                            )}`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Bat brand
                      </p>
                      <p className="mt-2 font-semibold">
                        {selectedBrand?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Intake type
                      </p>
                      <p className="mt-2 font-semibold">{intakeType}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Store
                      </p>
                      <p className="mt-2 font-semibold">
                        {selectedStore?.name ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Estimated delivery
                      </p>
                      <p className="mt-2 font-semibold">
                        {selectedDate
                          ? new Date(selectedDate).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Physical bill no
                      </p>
                      <p className="mt-2 font-semibold">
                        {physicalBillNo.trim() || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Repair items
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Items included in this job.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {repairItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-3 py-2 text-sm"
                        >
                          <span className="text-[var(--foreground)]">
                            {item.repairTypeName || "Repair item"}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            LKR {Number(item.price || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-4 text-xs text-[var(--text-muted)]">
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-[0.2em]">Advance</span>
                        <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-3 py-1 text-[var(--foreground)]">
                          LKR {Number(advanceAmount || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-[0.2em]">Total</span>
                        <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-3 py-1 text-[var(--foreground)]">
                          LKR {computedTotalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Description
                    </p>
                    <p className="mt-2 text-[var(--foreground)]">
                      {description?.trim() ? description : "No description added."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Tracking link
                    </p>
                    {trackingUrl ? (
                      <div className="mt-2 grid gap-3">
                        <p className="text-xs text-[var(--text-muted)]">
                          Share this link manually if customer SMS is not received.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="h-10 min-w-[16rem] flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-3 text-xs text-[var(--foreground)] outline-none"
                            value={trackingUrl}
                            readOnly
                          />
                          <button
                            type="button"
                            className="h-10 rounded-xl border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(trackingUrl);
                              } catch {
                                // no-op
                              }
                            }}
                          >
                            Copy Link
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Tracking link is not available for this repair.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              {!viewMode && !editMode ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span>
                    Bill number <span className="text-rose-400">*</span>
                  </span>
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    placeholder={billLoading ? "Loading..." : "Auto-generated"}
                    type="text"
                    value={billNo}
                    readOnly
                    disabled
                  />
                </label>
                <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span>
                    Client <span className="text-rose-400">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                      onClick={() => {
                        if (!viewMode && !editMode) {
                          setClientOpen((prev) => !prev);
                        }
                      }}
                      aria-expanded={clientOpen}
                      disabled={viewMode || editMode}
                    >
                      <span>
                        {selectedClient
                          ? `${selectedClient.name} - ${formatMobile(
                              selectedClient.mobile
                            )}`
                          : "Select client"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">v</span>
                    </button>
                    {clientOpen ? (
                      <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                        <div className="grid grid-cols-4 gap-2 p-2">
                          <input
                            className="col-span-3 h-10 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                            placeholder="Search name or mobile"
                            value={clientSearch}
                            onChange={(event) => setClientSearch(event.target.value)}
                          />
                          <button
                            type="button"
                            className="h-10 rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] text-base font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
                            onClick={() => {
                              setClientCreateOpen(true);
                              setClientOpen(false);
                              setClientCreateError(null);
                            }}
                            title="Add customer"
                          >
                            +
                          </button>
                        </div>
                        <div className="max-h-56 overflow-auto">
                          {clientLoading ? (
                            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              Loading clients...
                            </div>
                          ) : clientError ? (
                            <div className="px-3 py-2 text-xs text-rose-500">
                              {clientError}
                            </div>
                          ) : clients.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              No clients found.
                            </div>
                          ) : (
                            clients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                  selectedClient?.id === client.id
                                    ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                    : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                }`}
                                onClick={() => {
                                  setSelectedClient(client);
                                  setClientOpen(false);
                                }}
                              >
                                <span>
                                  {client.name} - {formatMobile(client.mobile)}
                                </span>
                                {selectedClient?.id === client.id ? (
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Selected
                                  </span>
                                ) : null}
                              </button>
                            ))
                          )}
                          {clientHasMore && !clientLoading && !clientError && !clientSearch.trim() ? (
                            <button
                              type="button"
                              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                              onClick={() => setClientPage((prev) => prev + 1)}
                              disabled={clientLoadingMore}
                            >
                              {clientLoadingMore ? "Loading..." : "Load more"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span>
                    Bat brand <span className="text-rose-400">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                      onClick={() => {
                        if (!viewMode) {
                          setBrandOpen((prev) => !prev);
                        }
                      }}
                      aria-expanded={brandOpen}
                      disabled={viewMode}
                    >
                      <span>{selectedBrand?.name ?? "Select brand"}</span>
                      <span className="text-xs text-[var(--text-muted)]">v</span>
                    </button>
                    {brandOpen ? (
                      <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                        <div className="grid grid-cols-4 gap-2 p-2">
                          <input
                            className="col-span-3 h-10 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                            placeholder="Search brands"
                            value={brandSearch}
                            onChange={(event) => setBrandSearch(event.target.value)}
                          />
                          <button
                            type="button"
                            className="h-10 rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] text-base font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
                            onClick={() => {
                              setBrandCreateOpen(true);
                              setBrandOpen(false);
                              setBrandCreateError(null);
                            }}
                            title="Add brand"
                          >
                            +
                          </button>
                        </div>
                        <div className="max-h-56 overflow-auto">
                          {brandLoading ? (
                            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              Loading brands...
                            </div>
                          ) : brandError ? (
                            <div className="px-3 py-2 text-xs text-rose-500">
                              {brandError}
                            </div>
                          ) : brands.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              No brands found.
                            </div>
                          ) : (
                            brands.map((brand) => (
                              <button
                                key={brand.id}
                                type="button"
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                  selectedBrand?.id === brand.id
                                    ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                    : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                }`}
                                onClick={() => {
                                  setSelectedBrand(brand);
                                  setBrandOpen(false);
                                }}
                              >
                                <span>{brand.name}</span>
                                {selectedBrand?.id === brand.id ? (
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Selected
                                  </span>
                                ) : null}
                              </button>
                            ))
                          )}
                          {brandHasMore && !brandLoading && !brandError && !brandSearch.trim() ? (
                            <button
                              type="button"
                              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                              onClick={() => setBrandPage((prev) => prev + 1)}
                              disabled={brandLoadingMore}
                            >
                              {brandLoadingMore ? "Loading..." : "Load more"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

                </>
              ) : null}
              {!viewMode && !editMode ? (
                <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>
                      Intake type <span className="text-rose-400">*</span>
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                        onClick={() => setIntakeOpen((prev) => !prev)}
                        aria-expanded={intakeOpen}
                      >
                        <span>{intakeType}</span>
                        <span className="text-xs text-[var(--text-muted)]">v</span>
                      </button>
                      {intakeOpen ? (
                        <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                          {["Walk-in", "Courier"].map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                intakeType === option
                                  ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                  : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                              }`}
                              onClick={() => {
                                setIntakeType(option);
                                setIntakeOpen(false);
                              }}
                            >
                              <span>{option}</span>
                              {intakeType === option ? (
                                <span className="text-xs text-[var(--text-muted)]">
                                  Selected
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>
                      Store <span className="text-rose-400">*</span>
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                        onClick={() => setStoreOpen((prev) => !prev)}
                        aria-expanded={storeOpen}
                      >
                        <span>{selectedStore?.name ?? "Select store"}</span>
                        <span className="text-xs text-[var(--text-muted)]">v</span>
                      </button>
                      {storeOpen ? (
                        <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                          <div className="p-2">
                            <input
                              className="h-10 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                              placeholder="Search stores"
                              value={storeSearch}
                              onChange={(event) => setStoreSearch(event.target.value)}
                            />
                          </div>
                          <div className="max-h-56 overflow-auto">
                            {storeLoading ? (
                              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                Loading stores...
                              </div>
                            ) : storeError ? (
                              <div className="px-3 py-2 text-xs text-rose-500">
                                {storeError}
                              </div>
                            ) : stores.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                No stores found.
                              </div>
                            ) : (
                              stores.map((store) => (
                                <button
                                  key={store.id}
                                  type="button"
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                    selectedStore?.id === store.id
                                      ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                      : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                  }`}
                                  onClick={() => {
                                    setSelectedStore(store);
                                    setStoreOpen(false);
                                  }}
                                >
                                  <span>{store.name}</span>
                                  {selectedStore?.id === store.id ? (
                                    <span className="text-xs text-[var(--text-muted)]">
                                      Selected
                                    </span>
                                  ) : null}
                                </button>
                              ))
                            )}
                            {storeHasMore && !storeLoading && !storeError && !storeSearch.trim() ? (
                              <button
                                type="button"
                                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                                onClick={() => setStorePage((prev) => prev + 1)}
                                disabled={storeLoadingMore}
                              >
                                {storeLoadingMore ? "Loading..." : "Load more"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>
                      Estimated delivery date <span className="text-rose-400">*</span>
                    </span>
                    <DeliveryDatePicker
                      value={selectedDate}
                      onChange={setSelectedDate}
                      countsByDate={deliveryCounts}
                      onMonthChange={handleCalendarMonthChange}
                      loading={calendarLoading}
                    />
                  </label>
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>Physical bill no (optional)</span>
                    <input
                      className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      placeholder="Enter physical bill no"
                      value={physicalBillNo}
                      onChange={(event) => setPhysicalBillNo(event.target.value)}
                      maxLength={50}
                    />
                  </label>
                </div>
                {calendarError ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {calendarError}
                </div>
              ) : null}
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Repair items
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Add one or more repair items to build the bill.
                    </p>
                  </div>
                  {!viewMode ? (
                    <button
                      type="button"
                      className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:border-[var(--accent)]"
                      onClick={addRepairItem}
                    >
                      Add Repair
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  {repairItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-3 md:grid-cols-[1.2fr_0.6fr_auto]"
                    >
                      <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        <span>Repair type</span>
                        <div className="relative">
                          <button
                            type="button"
                            className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                            onClick={() => {
                              if (!viewMode && !repairTypeOptionsLoading) {
                                setRepairTypeOpenId((prev) =>
                                  prev === item.id ? null : item.id
                                );
                                setRepairTypeSearchTerm("");
                              }
                            }}
                            aria-expanded={repairTypeOpenId === item.id}
                            disabled={viewMode || repairTypeOptionsLoading}
                          >
                            <span>
                              {item.repairTypeName ||
                                (repairTypeOptionsLoading
                                  ? "Loading types..."
                                  : "Select repair type")}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">v</span>
                          </button>
                          {repairTypeOpenId === item.id ? (
                            <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                              <div className="p-2">
                                <input
                                  className="h-9 w-full rounded-lg border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                                  placeholder="Search repair types"
                                  value={repairTypeSearchTerm}
                                  onChange={(event) => setRepairTypeSearchTerm(event.target.value)}
                                />
                              </div>
                              {repairTypeOptionsLoading ? (
                                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                  Loading types...
                                </div>
                              ) : repairTypeOptions.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                  No repair types found.
                                </div>
                              ) : (
                                repairTypeOptions.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                      option.id === item.repairTypeId
                                        ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                        : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                                    }`}
                                    onClick={() => {
                                      updateRepairItem(item.id, {
                                        repairTypeId: option.id,
                                        repairTypeName: `${option.code} - ${option.name}`,
                                      });
                                      setRepairTypeOpenId(null);
                                      setRepairTypeSearchTerm("");
                                    }}
                                  >
                                    <span>{option.code} - {option.name}</span>
                                    {option.id === item.repairTypeId ? (
                                      <span className="text-[10px] text-[var(--text-muted)]">
                                        Selected
                                      </span>
                                    ) : null}
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        <span>Price</span>
                        <input
                          className="h-10 rounded-xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                          placeholder="xxxx"
                          type="text"
                          inputMode="numeric"
                          pattern="\\d*"
                          value={item.price}
                          onChange={(event) => {
                            event.currentTarget.value =
                              event.currentTarget.value.replace(/\\D/g, "");
                            updateRepairItem(item.id, {
                              price: event.currentTarget.value,
                            });
                          }}
                          disabled={viewMode}
                        />
                      </label>
                      <div className="flex items-end justify-end">
                        {!viewMode ? (
                          <button
                            type="button"
                            className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-[10px] uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/20"
                            onClick={() => removeRepairItem(item.id)}
                            disabled={repairItems.length <= 1}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-end gap-4 text-xs text-[var(--text-muted)]">
                  <label className="grid gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>Advance</span>
                    <div className="relative w-32">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
                        LKR
                      </span>
                      <input
                        className="h-9 w-full rounded-full border border-[var(--stroke)] bg-[var(--panel)] pl-10 pr-4 text-xs text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        placeholder="xxxx"
                        type="text"
                        inputMode="numeric"
                        pattern="\\d*"
                        onChange={(event) => {
                          event.currentTarget.value = event.currentTarget.value.replace(
                            /\\D/g,
                            ""
                          );
                          setAdvanceAmount(event.currentTarget.value);
                        }}
                        value={advanceAmount}
                        disabled={viewMode}
                      />
                    </div>
                  </label>
                  <div className="grid gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <span>Total amount</span>
                    <span className="flex h-9 min-w-[8rem] items-center rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--foreground)]">
                      LKR {computedTotalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-muted)]">
                Tracking token (8-12 chars) will be generated on save, stored as a
                hash, and disabled after delivery.
              </div>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Description
                <textarea
                  className="min-h-[96px] rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  placeholder="Add repair notes, issues, or special instructions."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={viewMode}
                />
              </label>
                </>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    if (showCreateForm) {
                      setShowCreateForm(false);
                    } else {
                      setIsModalOpen(false);
                    }
                    resetRepairForm();
                  }}
                >
                  {viewMode ? "Close" : "Cancel"}
                </button>
                {!viewMode ? (
                  <button
                    type="button"
                    className="h-10 rounded-full bg-[var(--accent)] px-6 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={editMode ? handleUpdateRepair : handleCreateRepair}
                    disabled={creating || (editMode ? isEditUnchanged : false)}
                  >
                    {editMode ? "Update Repair" : "Save Repair"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Create repair job?"
        description={
          createError ??
          `Bill ${billNo} for ${
            selectedClient ? selectedClient.name : "client"
          } at ${selectedStore?.name ?? "store"} will be created and SMS will be sent.`
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        loading={creating}
        onCancel={() => {
          if (creating) {
            return;
          }
          setConfirmOpen(false);
        }}
        onConfirm={confirmCreateRepair}
      />
      {toast ? (
        <div
          className={`animate-rise fixed right-4 top-4 z-[120] w-[calc(100vw-2rem)] max-w-md rounded-2xl border px-4 py-3 text-sm shadow-xl sm:w-full ${
            toast.tone === "success"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/15 text-rose-100"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      {clientCreateOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                New Customer
              </p>
              <h3 className="mt-2 text-xl font-semibold">Create customer</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Add a customer and continue creating this repair.
              </p>
            </div>
            <div className="mt-6 grid gap-4">
              {clientCreateError ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {clientCreateError}
                </div>
              ) : null}
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Customer name
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Enter full name"
                  type="text"
                  value={clientCreateName}
                  onChange={(event) => {
                    setClientCreateName(event.target.value);
                    if (clientCreateError) {
                      setClientCreateError(null);
                    }
                  }}
                  disabled={clientCreateSaving}
                />
              </label>
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Mobile number
                <div className="flex h-11 items-center rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)]">
                  <span className="text-xs text-[var(--text-muted)]">+94</span>
                  <input
                    className="ml-2 w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
                    placeholder="Enter 9 digits"
                    type="tel"
                    inputMode="numeric"
                    value={clientCreateMobile}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      setClientCreateMobile(digits.slice(0, 9));
                      if (clientCreateError) {
                        setClientCreateError(null);
                      }
                    }}
                    disabled={clientCreateSaving}
                  />
                </div>
              </label>
              <div className="grid gap-2 text-sm text-[var(--text-muted)]">
                <span>Loyalty tier</span>
                <select
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  value={clientCreateTier}
                  onChange={(event) =>
                    setClientCreateTier(event.target.value as "BRONZE" | "SILVER" | "GOLD")
                  }
                  disabled={clientCreateSaving}
                >
                  <option value="BRONZE">Bronze</option>
                  <option value="SILVER">Silver</option>
                  <option value="GOLD">Gold</option>
                </select>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    if (clientCreateSaving) {
                      return;
                    }
                    setClientCreateOpen(false);
                    resetClientCreateForm();
                  }}
                  disabled={clientCreateSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  onClick={handleCreateClientFromRepair}
                  disabled={
                    clientCreateSaving ||
                    !clientCreateName.trim() ||
                    clientCreateMobile.replace(/\D/g, "").length !== 9
                  }
                >
                  {clientCreateSaving ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {brandCreateOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                New Brand
              </p>
              <h3 className="mt-2 text-xl font-semibold">Create bat brand</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Add a brand and continue creating this repair.
              </p>
            </div>
            <div className="mt-6 grid gap-4">
              {brandCreateError ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {brandCreateError}
                </div>
              ) : null}
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Brand name
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Enter bat brand"
                  type="text"
                  value={brandCreateName}
                  onChange={(event) => {
                    setBrandCreateName(event.target.value);
                    if (brandCreateError) {
                      setBrandCreateError(null);
                    }
                  }}
                  disabled={brandCreateSaving}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    if (brandCreateSaving) {
                      return;
                    }
                    setBrandCreateOpen(false);
                    resetBrandCreateForm();
                  }}
                  disabled={brandCreateSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  onClick={handleCreateBrandFromRepair}
                  disabled={brandCreateSaving || !brandCreateName.trim()}
                >
                  {brandCreateSaving ? "Saving..." : "Save Brand"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={validationOpen}
        title="Missing required fields"
        description={validationMessage || "Please complete the required fields."}
        confirmLabel="Okay"
        cancelLabel="Close"
        onCancel={() => setValidationOpen(false)}
        onConfirm={() => setValidationOpen(false)}
      />
      <ConfirmDialog
        open={repairTypeDeleteOpen}
        title={`Delete ${pendingRepairTypeDelete?.name ?? "repair type"}?`}
        description="This will remove the repair type from the catalog."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={repairTypeSaving}
        onCancel={() => {
          if (repairTypeSaving) {
            return;
          }
          setRepairTypeDeleteOpen(false);
          setPendingRepairTypeDelete(null);
        }}
        onConfirm={confirmDeleteRepairType}
      />
      <ConfirmDialog
        open={statusConfirmOpen}
        title="Update status?"
        description={
          pendingStatusRepair
            ? `Move ${pendingStatusRepair.billNo} from ${
                statusMeta[pendingStatusRepair.status]?.label ??
                pendingStatusRepair.status
              } to ${
                statusMeta[nextStatus(pendingStatusRepair.status) ?? ""]?.label ??
                nextStatus(pendingStatusRepair.status) ??
                "next status"
              }.`
            : "Confirm status update."
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        loading={Boolean(pendingStatusRepair && statusUpdatingId === pendingStatusRepair.id)}
        onCancel={() => {
          if (statusUpdatingId) {
            return;
          }
          setStatusConfirmOpen(false);
          setPendingStatusRepair(null);
        }}
        onConfirm={confirmStatusAdvance}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Delete ${pendingDelete?.billNo ?? "repair"}?`}
        description="This will permanently remove the repair job."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onCancel={() => {
          if (deleting) {
            return;
          }
          setDeleteConfirmOpen(false);
          setPendingDelete(null);
        }}
        onConfirm={confirmDeleteRepair}
      />
    </section>
  );
}
