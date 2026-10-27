import 'dotenv/config';
import { z } from 'zod';
export const config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    WEB_URL: z.url().default('http://localhost:4173'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('../../.data/receipts'),
    MAIL_DRIVER: z.enum(['file', 'smtp']).default('file'),
    MAIL_DIRECTORY: z.string().default('../../.data/mail'),
    MAIL_FROM: z.string().default('WarrantyVault <noreply@example.com>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.string().default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    EXPIRING_SOON_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10485760),
  })
  .parse(process.env);
const webUrl = new URL(config.WEB_URL);
if (!['http:', 'https:'].includes(webUrl.protocol) || webUrl.origin !== config.WEB_URL)
  throw new Error('WEB_URL must be an exact HTTP(S) origin, without a path or trailing slash');
if (
  config.NODE_ENV === 'production' &&
  (config.STORAGE_DRIVER !== 's3' ||
    config.MAIL_DRIVER !== 'smtp' ||
    !config.WEB_URL.startsWith('https://') ||
    config.JWT_SECRET.startsWith('replace-'))
)
  throw new Error('Production requires S3, SMTP, HTTPS and a random JWT secret');
if (config.STORAGE_DRIVER === 's3' && !config.S3_BUCKET) throw new Error('S3_BUCKET is required');
if (config.MAIL_DRIVER === 'smtp' && !config.SMTP_HOST) throw new Error('SMTP_HOST is required');
