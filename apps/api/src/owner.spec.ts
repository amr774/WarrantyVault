import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Database } from './database';
import { OwnerController, OwnerGuard } from './owner';
import { config } from './config';

describe('Owner permission guard', () => {
  const findUnique = jest.fn();
  const guard = new OwnerGuard({ user: { findUnique } } as unknown as Database);
  const context = (userId?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ userId, role: 'OWNER' }) }),
    }) as ExecutionContext;
  beforeEach(() => findUnique.mockReset());
  it('rejects missing authentication even when a request claims the owner role', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('rejects a member or removed account', async () => {
    for (const user of [{ role: 'USER' }, null]) {
      findUnique.mockResolvedValueOnce(user);
      await expect(guard.canActivate(context('member'))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
  it('checks the current database role on every request', async () => {
    findUnique.mockResolvedValueOnce({ role: 'OWNER' }).mockResolvedValueOnce({ role: 'USER' });
    await expect(guard.canActivate(context('owner'))).resolves.toBe(true);
    await expect(guard.canActivate(context('owner'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('Owner summary', () => {
  it('uses the same configurable expiration threshold as the product dashboard', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const db = {
      user: { count: jest.fn().mockResolvedValue(0) },
      product: { count },
      receipt: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { size: null } }),
      },
      subscriptionPlan: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const previousThreshold = config.EXPIRING_SOON_DAYS;
    jest.useFakeTimers().setSystemTime(new Date('2026-10-25T12:00:00Z'));
    config.EXPIRING_SOON_DAYS = 14;
    try {
      await new OwnerController(db as unknown as Database).summary();
      expect(count).toHaveBeenCalledWith({
        where: { expiresAt: { gt: new Date('2026-11-08T00:00:00Z') } },
      });
      expect(count).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            gte: new Date('2026-10-25T00:00:00Z'),
            lte: new Date('2026-11-08T00:00:00Z'),
          },
        },
      });
    } finally {
      config.EXPIRING_SOON_DAYS = previousThreshold;
      jest.useRealTimers();
    }
  });
});
