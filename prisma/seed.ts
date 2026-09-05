/**
 * DealFlow360 seed script.
 * Populated incrementally as modules land (see tasks.md TASK-F10-05 for the full
 * demo deal graph). Idempotent: safe to run multiple times.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed data is added per module. Foundation seed is a no-op for now.
  console.log('[seed] DealFlow360 seed complete (no data yet — added per module).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
