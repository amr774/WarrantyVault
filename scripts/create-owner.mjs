// Local operator command only: never expose this operation through registration.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { scannerTestDatabase } from './scanner-test-db.mjs';
config({ path: resolve(import.meta.dirname, '../apps/api/.env'), quiet: true });
const args = process.argv.slice(2);
const email = args.find(value => !value.startsWith('--'))?.trim().toLowerCase();
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: node scripts/create-owner.mjs email@example.com [--scanner-test]');
}
const test = args.includes('--scanner-test');
if (test) process.env.DATABASE_URL = scannerTestDatabase();
const db = new PrismaClient();
try {
  const result = await db.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      await tx.user.update({ where: { id: existing.id }, data: { role: 'OWNER' } });
      return { email, role: 'OWNER', created: false, message: 'Use your existing password. No credentials or data were changed.' };
    }
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });
    const user = await tx.user.create({ data: {
      email, name: email.split('@')[0], role: 'OWNER',
      passwordHash: await bcrypt.hash(randomBytes(48).toString('base64url'), 12),
      subscription: { create: { planId: plan.id } }, reminderPreference: { create: {} },
    } });
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600000);
    await tx.passwordResetToken.create({ data: {
      userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt,
    } });
    const baseURL = test ? 'http://localhost:4174' : process.env.WEB_URL;
    if (!baseURL) throw new Error('WEB_URL must be configured');
    return { email, role: 'OWNER', created: true, expiresAt, setupUrl: `${baseURL}/reset-password#token=${token}` };
  }, { timeout: 30000 });
  // One-time setup link is shown only to the local operator, never emailed externally.
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); }
