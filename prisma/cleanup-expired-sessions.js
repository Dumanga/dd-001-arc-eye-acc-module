async function main() {
  const [{ PrismaClient }] = await Promise.all([import("@prisma/client")]);
  const prisma = new PrismaClient();

  try {
    const now = new Date();
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });

    console.log(
      `[session-cleanup] Removed ${result.count} expired session(s) at ${now.toISOString()}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[session-cleanup] Failed:", error);
  process.exit(1);
});
