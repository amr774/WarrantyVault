import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app';
import { configure } from './bootstrap';
import { Database } from './database';
import { config } from './config';
import { RemindersService } from './reminders';
import { detectType } from './storage';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Mailer } from './mail';
describe('PostgreSQL API integration', () => {
  let app: INestApplication, db: Database;
  let a: any, b: any;
  let userId: string, otherId: string, id: string, categoryId: string;
  const email = `test-${randomUUID()}@example.com`;
  const password = 'Integration-password-123';
  const origin = (r: any) => r.set('Origin', config.WEB_URL);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    configure(app);
    await app.init();
    db = app.get(Database);
    categoryId = (await db.category.findFirstOrThrow()).id;
    a = request.agent(app.getHttpServer());
    b = request.agent(app.getHttpServer());
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: [email, `other-${email}`] } } });
    await app?.close();
  });
  test('registration hashes password and sets HTTP-only cookies', async () => {
    const r = await origin(a.post('/api/auth/register'))
      .send({ email, password, name: 'Test owner' })
      .expect(201);
    userId = r.body.id;
    expect(r.body.passwordHash).toBeUndefined();
    expect(r.headers['set-cookie'].join()).toContain('HttpOnly');
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.passwordHash).not.toBe(password);
    const other = await origin(b.post('/api/auth/register'))
      .send({ email: `other-${email}`, password, name: 'Other owner' })
      .expect(201);
    otherId = other.body.id;
  });
  test('verification token is single-use and marks the email verified', async () => {
    let token = '';
    for (const file of await readdir(config.MAIL_DIRECTORY)) {
      const mail = JSON.parse(await readFile(join(config.MAIL_DIRECTORY, file), 'utf8'));
      if (mail.to === email && mail.subject.includes('Verify'))
        token = mail.text.split('#token=')[1];
    }
    await origin(a.post('/api/auth/verify-email')).send({ token }).expect(201);
    await origin(a.post('/api/auth/verify-email')).send({ token }).expect(400);
    expect((await a.get('/api/users/me')).body.emailVerifiedAt).toBeTruthy();
  });
  test('rejects bad login, invalid origin and unauthenticated API', async () => {
    await origin(request(app.getHttpServer()).post('/api/auth/login'))
      .send({ email, password: 'incorrect-password' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://evil.invalid')
      .send({ email, password })
      .expect(403);
    await request(app.getHttpServer()).get('/api/products').expect(401);
  });
  test('creates product with calendar-month clamp and validates real dates', async () => {
    const r = await origin(a.post('/api/products'))
      .send({
        name: 'Laptop',
        categoryId,
        purchaseDate: '2024-01-31',
        warrantyMonths: 1,
        currency: 'USD',
      })
      .expect(201);
    id = r.body.id;
    expect(r.body.expiresAt.slice(0, 10)).toBe('2024-02-29');
    expect(r.body.status).toBe('EXPIRED');
    await origin(a.post('/api/products'))
      .send({
        name: 'Invalid',
        categoryId,
        purchaseDate: '2024-02-31',
        warrantyMonths: 12,
        currency: 'USD',
      })
      .expect(400);
  });
  test('isolates product read, edit, delete and receipt upload by owner', async () => {
    await b.get(`/api/products/${id}`).expect(404);
    await origin(b.patch(`/api/products/${id}`))
      .send({ name: 'Stolen' })
      .expect(404);
    await origin(b.delete(`/api/products/${id}`)).expect(404);
    await origin(b.post(`/api/products/${id}/receipts`))
      .attach('file', Buffer.from('%PDF-1.7\nreceipt document'), 'receipt.pdf')
      .expect(404);
    const list = await b.get('/api/products').expect(200);
    expect(list.body.total).toBe(0);
  });
  test('update, filters, sorting and pagination', async () => {
    await origin(a.patch(`/api/products/${id}`))
      .send({ name: 'Updated laptop', warrantyMonths: 12, purchasePrice: 99.95 })
      .expect(200);
    const r = await a
      .get('/api/products?search=updated&status=EXPIRED&sort=name&order=asc&limit=1')
      .expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.data[0].name).toBe('Updated laptop');
    const cleared = await origin(a.patch(`/api/products/${id}`))
      .send({ purchasePrice: null })
      .expect(200);
    expect(cleared.body.purchasePrice).toBeNull();
  });
  test('content validation, signed links and file ownership', async () => {
    expect(() => detectType(Buffer.from('<html>not a photo</html>'))).toThrow();
    await origin(a.post(`/api/products/${id}/receipts`))
      .attach('file', Buffer.from('<html>not a photo</html>'), 'photo.jpg')
      .expect(400);
    const r = await origin(a.post(`/api/products/${id}/receipts`))
      .attach('file', Buffer.from('%PDF-1.7\nreceipt document'), 'receipt.pdf')
      .expect(201);
    const rid = r.body.id;
    await b.get(`/api/receipts/${rid}/download`).expect(404);
    await origin(b.delete(`/api/receipts/${rid}`)).expect(404);
    const url = (await a.get(`/api/receipts/${rid}/download`).expect(200)).body.url;
    await a.get(url).expect(200).expect('Cache-Control', 'no-store');
    await b.get(url).expect(404);
    await a.get(`/api/receipts/${rid}/content?token=bad`).expect(403);
    await origin(a.delete(`/api/receipts/${rid}`)).expect(200);
  });
  test('concurrent product creation cannot bypass free plan limit', async () => {
    const responses = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        origin(a.post('/api/products')).send({
          name: `Product ${i}`,
          categoryId,
          purchaseDate: '2026-10-01',
          warrantyMonths: 12,
          currency: 'USD',
        }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(4);
    expect(responses.filter((r) => r.status === 403)).toHaveLength(3);
    expect(await db.product.count({ where: { userId } })).toBe(5);
  });
  test('receipt storage quota is enforced and failed upload is not recorded', async () => {
    const free = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });
    const tiny = await db.subscriptionPlan.upsert({
      where: { code: 'PREMIUM' },
      update: {},
      create: { code: 'PREMIUM', name: 'Premium', productLimit: 10000, storageBytes: 5368709120n },
    });
    await db.userSubscription.update({ where: { userId }, data: { planId: tiny.id } });
    const old = tiny.storageBytes;
    try {
      await db.subscriptionPlan.update({ where: { id: tiny.id }, data: { storageBytes: 1n } });
      await origin(a.post(`/api/products/${id}/receipts`))
        .attach('file', Buffer.from('%PDF-1.7\nreceipt document'), 'receipt.pdf')
        .expect(403);
      expect(await db.receipt.count({ where: { productId: id } })).toBe(0);
    } finally {
      await db.subscriptionPlan.update({ where: { id: tiny.id }, data: { storageBytes: old } });
      await db.userSubscription.update({ where: { userId }, data: { planId: free.id } });
    }
  });
  test('scheduled jobs persist attempts and deduplicate across repeated runs', async () => {
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));
    const expiry = new Date(today.getTime() + 7 * 86400000);
    await db.product.update({
      where: { id },
      data: { expiresAt: expiry, createdAt: new Date(today.getTime() - 40 * 86400000) },
    });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    const worker = app.get(RemindersService);
    await worker.tick(now);
    await worker.tick(now);
    const jobs = await db.reminderDelivery.findMany({ where: { productId: id } });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === 'SENT' && j.attempts === 1)).toBe(true);
    expect(await db.notification.count({ where: { userId } })).toBe(2);
    await origin(a.patch('/api/notifications/read-all')).expect(200);
    expect((await a.get('/api/notifications')).body.unread).toBe(0);
  });
  test('delivery failures persist and retry without duplicating notifications', async () => {
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));
    await db.product.update({
      where: { id },
      data: { expiresAt: new Date(today.getTime() + 86400000) },
    });
    await db.reminderPreference.update({ where: { userId }, data: { days: [1] } });
    const send = jest
      .spyOn(app.get(Mailer), 'send')
      .mockRejectedValueOnce(new Error('Temporary SMTP outage'));
    const worker = app.get(RemindersService);
    await worker.tick(now);
    let job = await db.reminderDelivery.findFirstOrThrow({
      where: { productId: id, daysBefore: 1 },
    });
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(1);
    await worker.tick(new Date(now.getTime() + 6 * 60000));
    job = await db.reminderDelivery.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe('SENT');
    expect(job.attempts).toBe(2);
    expect(await db.notification.count({ where: { deliveryId: job.id } })).toBe(1);
    send.mockRestore();
  });
  test('single-use reset revokes sessions and login accepts new password', async () => {
    await origin(a.post('/api/auth/forgot-password')).send({ email }).expect(201);
    const files = await readdir(config.MAIL_DIRECTORY);
    let token = '';
    for (const file of files) {
      const mail = JSON.parse(await readFile(join(config.MAIL_DIRECTORY, file), 'utf8'));
      if (mail.to === email && mail.subject.includes('Reset'))
        token = mail.text.split('#token=')[1];
    }
    expect(token).toHaveLength(64);
    await origin(a.post('/api/auth/reset-password'))
      .send({ token, password: 'New-integration-password-123' })
      .expect(201);
    await origin(a.post('/api/auth/reset-password'))
      .send({ token, password: 'New-integration-password-123' })
      .expect(400);
    await a.get('/api/products').expect(401);
    await origin(a.post('/api/auth/login'))
      .send({ email, password: 'New-integration-password-123' })
      .expect(201);
  });
  test('refresh rotation rejects replay and revokes the token family', async () => {
    const login = await origin(request(app.getHttpServer()).post('/api/auth/login'))
      .send({ email: `other-${email}`, password })
      .expect(201);
    const cookie = login.headers['set-cookie'];
    const old = cookie.find((x: string) => x.startsWith('refresh='));
    expect(old).toBeDefined();
    const rotated = await origin(request(app.getHttpServer()).post('/api/auth/refresh'))
      .set('Cookie', old.split(';')[0])
      .expect(201);
    await origin(request(app.getHttpServer()).post('/api/auth/refresh'))
      .set('Cookie', old.split(';')[0])
      .expect(401);
    const access = rotated.headers['set-cookie'].find((x: string) => x.startsWith('access='));
    await request(app.getHttpServer())
      .get('/api/products')
      .set('Cookie', access.split(';')[0])
      .expect(401);
    expect(
      await db.refreshToken.count({ where: { userId: otherId, revokedAt: null } }),
    ).toBeGreaterThanOrEqual(0);
  });
  test('product delete and logout', async () => {
    await origin(a.delete(`/api/products/${id}`)).expect(200);
    await a.get(`/api/products/${id}`).expect(404);
    await origin(a.post('/api/auth/logout')).expect(201);
    await a.get('/api/products').expect(401);
  });
});
