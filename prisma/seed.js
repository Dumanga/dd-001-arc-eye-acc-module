async function main() {
  const [{ PrismaClient }, bcryptModule, fsModule, pathModule] = await Promise.all([
    import("@prisma/client"),
    import("bcryptjs"),
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const fs = fsModule.default ?? fsModule;
  const path = pathModule.default ?? pathModule;
  const prisma = new PrismaClient();
  const accountCatalog = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "src", "lib", "accounting", "data", "accounts.json"), "utf8")
  );
  const uomCatalog = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "src", "lib", "accounting", "data", "uom-categories.json"), "utf8")
  );

  function toLookupCode(value) {
    return String(value)
      .trim()
      .toUpperCase()
      .replace(/&/g, " AND ")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeName(value) {
    return String(value).trim().replace(/\s+/g, " ");
  }

  function normalizeUomName(value) {
    return normalizeName(value).toUpperCase();
  }

  function isCurrencyTrackedType(value) {
    const normalized = String(value).trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ");
    return normalized.includes("CASH") && normalized.includes("EQUIVAL");
  }

  const categoryLabels = {
    ASSET: "Assets",
    LIABILITIES: "Liabilities",
    EQUITY: "Equity",
    INCOME: "Income",
    EXPENSES: "Expenses",
  };

  const password = "DOB@2026";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.store.upsert({
    where: { code: "MAIN-001" },
    update: {
      name: "Kotte Store - Main",
      city: "Colombo",
      status: "ACTIVE",
    },
    create: {
      code: "MAIN-001",
      name: "Kotte Store - Main",
      city: "Colombo",
      status: "ACTIVE",
    },
  });

  await prisma.accountingUser.upsert({
    where: { username: "accounting.superadmin@dob.com" },
    update: {
      displayName: "Accounting Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      profileImageId: 1,
      storeId: null,
      accessDashboard: true,
      accessSuppliers: true,
      accessCustomers: true,
      accessInventory: true,
      accessAccounts: true,
      accessReports: true,
      accessPos: true,
      accessSettings: true,
    },
    create: {
      username: "accounting.superadmin@dob.com",
      displayName: "Accounting Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      profileImageId: 1,
      storeId: null,
      accessDashboard: true,
      accessSuppliers: true,
      accessCustomers: true,
      accessInventory: true,
      accessAccounts: true,
      accessReports: true,
      accessPos: true,
      accessSettings: true,
    },
  });

  const categoryEntries = Object.entries(accountCatalog);

  for (const [categoryIndex, [rawCategoryCode, rawTypes]] of categoryEntries.entries()) {
    const categoryCode = toLookupCode(rawCategoryCode);
    const category = await prisma.accountingAccountCategory.upsert({
      where: { code: categoryCode },
      update: {
        name: categoryLabels[categoryCode] ?? normalizeName(rawCategoryCode),
        description: null,
        displayOrder: categoryIndex,
        isActive: true,
      },
      create: {
        code: categoryCode,
        name: categoryLabels[categoryCode] ?? normalizeName(rawCategoryCode),
        description: null,
        displayOrder: categoryIndex,
        isActive: true,
      },
    });

    const typeEntries = Object.entries(rawTypes);

    for (const [typeIndex, [rawTypeName, rawSubtypes]] of typeEntries.entries()) {
      const typeName = normalizeName(rawTypeName);
      const type = await prisma.accountingAccountType.upsert({
        where: {
          categoryId_code: {
            categoryId: category.id,
            code: toLookupCode(rawTypeName),
          },
        },
        update: {
          name: typeName,
          description: null,
          displayOrder: typeIndex,
          requiresCurrency: isCurrencyTrackedType(rawTypeName),
          isActive: true,
        },
        create: {
          categoryId: category.id,
          code: toLookupCode(rawTypeName),
          name: typeName,
          description: null,
          displayOrder: typeIndex,
          requiresCurrency: isCurrencyTrackedType(rawTypeName),
          isActive: true,
        },
      });

      for (const [subtypeIndex, rawSubtypeName] of rawSubtypes.entries()) {
        const subtypeName = normalizeName(rawSubtypeName);

        await prisma.accountingAccountSubtype.upsert({
          where: {
            typeId_code: {
              typeId: type.id,
              code: toLookupCode(rawSubtypeName),
            },
          },
          update: {
            name: subtypeName,
            description: null,
            displayOrder: subtypeIndex,
            isActive: true,
          },
          create: {
            typeId: type.id,
            code: toLookupCode(rawSubtypeName),
            name: subtypeName,
            description: null,
            displayOrder: subtypeIndex,
            isActive: true,
          },
        });
      }
    }
  }

  for (const categoryDefinition of uomCatalog) {
    const category = await prisma.accountingUomCategory.upsert({
      where: { code: categoryDefinition.code },
      update: {
        name: normalizeName(categoryDefinition.name),
        description: categoryDefinition.description ?? null,
        baseUnitName: normalizeName(categoryDefinition.baseUnit),
        defaultSmallestAllowedQty: categoryDefinition.defaultSmallestAllowedQty,
        displayOrder: Number(categoryDefinition.displayOrder) || 0,
        isActive: true,
      },
      create: {
        code: categoryDefinition.code,
        name: normalizeName(categoryDefinition.name),
        description: categoryDefinition.description ?? null,
        baseUnitName: normalizeName(categoryDefinition.baseUnit),
        defaultSmallestAllowedQty: categoryDefinition.defaultSmallestAllowedQty,
        displayOrder: Number(categoryDefinition.displayOrder) || 0,
        isActive: true,
      },
    });

    const baseUnit = await prisma.accountingUom.upsert({
      where: {
        categoryId_normalizedName: {
          categoryId: category.id,
          normalizedName: normalizeUomName(categoryDefinition.baseUnit),
        },
      },
      update: {
        name: normalizeName(categoryDefinition.baseUnit),
        ratioToBase: "1.00000",
        smallestAllowedQty: categoryDefinition.defaultSmallestAllowedQty,
        isActive: true,
        isSystem: true,
        isBase: true,
        createdByUserId: null,
      },
      create: {
        categoryId: category.id,
        name: normalizeName(categoryDefinition.baseUnit),
        normalizedName: normalizeUomName(categoryDefinition.baseUnit),
        ratioToBase: "1.00000",
        smallestAllowedQty: categoryDefinition.defaultSmallestAllowedQty,
        isActive: true,
        isSystem: true,
        isBase: true,
        createdByUserId: null,
      },
    });

    await prisma.accountingUom.updateMany({
      where: {
        categoryId: category.id,
        isBase: true,
        id: {
          not: baseUnit.id,
        },
      },
      data: {
        isBase: false,
      },
    });
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
