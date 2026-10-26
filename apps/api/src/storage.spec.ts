import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRequest } from './auth';
import { Database } from './database';
import { ProductsService } from './products';
import { ReceiptsController, StorageService } from './storage';

describe('Private document deletion', () => {
  const request = { userId: 'user-id' } as AuthRequest;
  const key = 'private-document-key';

  test.each(['product', 'receipt'] as const)(
    'keeps files intact when %s deletion rolls back',
    async (kind) => {
      const failure = new Error('Database deletion failed');
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        pendingFileDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        product: {
          findFirst: jest.fn().mockResolvedValue({ receipts: [{ storageKey: key }] }),
          delete: jest.fn().mockRejectedValue(failure),
        },
        receipt: {
          findFirst: jest.fn().mockResolvedValue({ storageKey: key }),
          delete: jest.fn().mockRejectedValue(failure),
        },
      };
      const db = { $transaction: (run: (value: typeof tx) => unknown) => run(tx) };
      const storage = new StorageService({} as JwtService, db as unknown as Database);
      const remove = jest.spyOn(storage, 'remove').mockResolvedValue();
      const cleanup = jest.spyOn(storage, 'cleanupPending');
      const controller = new ReceiptsController(
        db as unknown as Database,
        {} as ProductsService,
        storage,
        {} as JwtService,
      );
      const result =
        kind === 'product'
          ? controller.removeProduct(request, 'product-id')
          : controller.remove(request, 'receipt-id');
      await expect(result).rejects.toBe(failure);
      expect(tx.pendingFileDeletion.createMany).toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(cleanup).not.toHaveBeenCalled();
    },
  );

  test('starts file cleanup only after the deletion transaction commits', async () => {
    const events: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      pendingFileDeletion: { createMany: jest.fn(async () => events.push('queued')) },
      receipt: {
        findFirst: jest.fn().mockResolvedValue({ storageKey: key }),
        delete: jest.fn(async () => events.push('record-deleted')),
      },
    };
    const db = {
      $transaction: async (run: (value: typeof tx) => unknown) => {
        const result = await run(tx);
        events.push('committed');
        return result;
      },
    };
    const storage = new StorageService({} as JwtService, db as unknown as Database);
    jest.spyOn(storage, 'cleanupPending').mockImplementation(async () => {
      events.push('cleanup');
    });
    const controller = new ReceiptsController(
      db as unknown as Database,
      {} as ProductsService,
      storage,
      {} as JwtService,
    );
    await expect(controller.remove(request, 'receipt-id')).resolves.toEqual({ ok: true });
    expect(events).toEqual(['queued', 'record-deleted', 'committed', 'cleanup']);
  });

  test('retains a failed cleanup job and removes it after a successful retry', async () => {
    const pendingFileDeletion = {
      findMany: jest.fn().mockResolvedValue([{ storageKey: key }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const storage = new StorageService(
      {} as JwtService,
      { pendingFileDeletion } as unknown as Database,
    );
    const remove = jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('Disk unavailable'))
      .mockResolvedValueOnce();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      await expect(storage.cleanupPending([key])).resolves.toBeUndefined();
      expect(pendingFileDeletion.deleteMany).not.toHaveBeenCalled();
      expect(pendingFileDeletion.updateMany).toHaveBeenCalledWith({
        where: { storageKey: key },
        data: { attempts: { increment: 1 } },
      });
      await storage.retryPendingDeletions();
      expect(remove).toHaveBeenCalledTimes(2);
      expect(pendingFileDeletion.deleteMany).toHaveBeenCalledWith({ where: { storageKey: key } });
      expect(pendingFileDeletion.findMany).toHaveBeenLastCalledWith({
        orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
        take: 50,
      });
    } finally {
      warn.mockRestore();
    }
  });
});
