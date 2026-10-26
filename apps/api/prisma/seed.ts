import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  for (const name of [
    'Electronics',
    'Appliances',
    'Home & living',
    'Personal care',
    'Tools & equipment',
    'Other',
  ])
    await db.category.upsert({ where: { name }, create: { name }, update: {} });
  await db.subscriptionPlan.upsert({
    where: { code: 'FREE' },
    create: { code: 'FREE', name: 'Free', productLimit: 5, storageBytes: 52428800n },
    update: {},
  });
  await db.subscriptionPlan.upsert({
    where: { code: 'PREMIUM' },
    create: { code: 'PREMIUM', name: 'Premium', productLimit: 10000, storageBytes: 5368709120n },
    update: {},
  });
}
main().finally(() => db.$disconnect());
