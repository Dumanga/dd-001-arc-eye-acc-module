import { PrismaClient } from "@prisma/client";
import bcryptModule from "bcryptjs";
const bcrypt = bcryptModule.default ?? bcryptModule;
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash("Test@2026", 12);
const updated = await prisma.accountingUser.updateMany({
  where: { username: "test" },
  data: { passwordHash },
});
console.log(`Updated ${updated.count} row(s). Password is now Test@2026.`);
await prisma.$disconnect();
