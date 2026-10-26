import {
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthGuard, AuthRequest } from './auth';
import { Database } from './database';
import { config } from './config';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private db: Database) {}
  async canActivate(context: ExecutionContext) {
    const { userId } = context.switchToHttp().getRequest<AuthRequest>();
    const user = userId
      ? await this.db.user.findUnique({
          where: { id: userId },
          select: { role: true },
        })
      : null;
    // Read current database permissions, never trust a browser field or stale JWT role.
    if (user?.role !== 'OWNER') throw new ForbiddenException('Owner access required');
    return true;
  }
}

export class OwnerUsersQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
}

@Controller('owner')
@UseGuards(AuthGuard, OwnerGuard)
export class OwnerController {
  constructor(private db: Database) {}

  @Get('summary') async summary() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const soon = new Date(today.getTime() + config.EXPIRING_SOON_DAYS * 86400000);
    const since = new Date(today.getTime() - 30 * 86400000);
    const [
      users,
      products,
      receipts,
      storage,
      active,
      expiring,
      expired,
      newUsers,
      plans,
      categories,
    ] = await this.db.$transaction(
      [
        this.db.user.count(),
        this.db.product.count(),
        this.db.receipt.count(),
        this.db.receipt.aggregate({ _sum: { size: true } }),
        this.db.product.count({ where: { expiresAt: { gt: soon } } }),
        this.db.product.count({ where: { expiresAt: { gte: today, lte: soon } } }),
        this.db.product.count({ where: { expiresAt: { lt: today } } }),
        this.db.user.count({ where: { createdAt: { gte: since } } }),
        this.db.subscriptionPlan.findMany({
          select: { code: true, name: true, _count: { select: { subscriptions: true } } },
          orderBy: { code: 'asc' },
        }),
        this.db.category.findMany({
          select: { name: true, _count: { select: { products: true } } },
          orderBy: { name: 'asc' },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      users,
      products,
      receipts,
      storageBytes: storage._sum.size ?? 0,
      expiringSoonDays: config.EXPIRING_SOON_DAYS,
      warranties: { active, expiring, expired },
      newUsers,
      plans: plans.map((p) => ({ name: p.name, code: p.code, count: p._count.subscriptions })),
      categories: categories.map((c) => ({ name: c.name, count: c._count.products })),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('users') async users(@Query() query: OwnerUsersQuery) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const pageSize = 20;
    const [total, data] = await this.db.$transaction(
      [
        this.db.user.count({ where }),
        this.db.user.findMany({
          where,
          skip: (query.page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            emailVerifiedAt: true,
            subscription: { select: { plan: { select: { name: true, code: true } } } },
            _count: { select: { products: true } },
          },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total, data, page: query.page, pageSize };
  }
}

@Module({ controllers: [OwnerController], providers: [OwnerGuard] })
export class OwnerModule {}
