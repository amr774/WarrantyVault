import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth';
import { Database } from './database';
import { Mailer } from './mail';

describe('Email verification token consumption', () => {
  test('returns a validation error when a concurrent request already consumed the token', async () => {
    const userUpdate = jest.fn();
    const tx = {
      emailVerificationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'token-id',
          userId: 'user-id',
          expiresAt: new Date(Date.now() + 60000),
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: userUpdate },
    };
    const db = { $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) };
    const auth = new AuthService(db as unknown as Database, {} as JwtService, {} as Mailer);
    await expect(auth.verify('already-claimed-token')).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
