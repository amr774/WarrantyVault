import {
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Database } from './database';
import { Mailer } from './mail';
import { AuthGuard, AuthRequest } from './auth';
import { dateOnly } from './warranty';
import { ListDto } from './products';
@Injectable()
export class RemindersService {
  private logger = new Logger(RemindersService.name);
  constructor(
    private db: Database,
    private mail: Mailer,
  ) {}
  @Cron('0 */5 * * * *', { waitForCompletion: true })
  async tick(now = new Date()) {
    const today = dateOnly(now);
    const products = await this.db.product.findMany({
      where: { expiresAt: { gte: today, lte: new Date(today.getTime() + 365 * 86400000) } },
      include: { user: { include: { reminderPreference: true } } },
    });
    for (const p of products) {
      const pref = p.user.reminderPreference;
      if (!pref || (!pref.emailEnabled && !pref.inAppEnabled)) continue;
      const remaining = Math.round((p.expiresAt.getTime() - today.getTime()) / 86400000);
      for (const day of pref.days) {
        const due = new Date(p.expiresAt.getTime() - day * 86400000);
        if (remaining > day || dateOnly(p.createdAt) > due) continue;
        await this.db.reminderDelivery.upsert({
          where: {
            productId_expirationDate_daysBefore: {
              productId: p.id,
              expirationDate: p.expiresAt,
              daysBefore: day,
            },
          },
          create: {
            productId: p.id,
            expirationDate: p.expiresAt,
            daysBefore: day,
            nextAttemptAt: now,
          },
          update: {},
        });
      }
    }
    // Reclaim jobs if a worker died after acquiring its lease.
    await this.db.reminderDelivery.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: new Date(now.getTime() - 15 * 60000) } },
      data: { status: 'FAILED', nextAttemptAt: now },
    });
    const jobs = await this.db.reminderDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: now },
        attempts: { lt: 8 },
      },
      take: 100,
      include: { product: { include: { user: { include: { reminderPreference: true } } } } },
    });
    for (const job of jobs) {
      const claim = await this.db.reminderDelivery.updateMany({
        where: { id: job.id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      try {
        const p = job.product;
        const pref = p.user.reminderPreference;
        const message = `${p.name}'s warranty expires on ${p.expiresAt.toISOString().slice(0, 10)}. Keep your receipts ready.`;
        if (p.expiresAt.getTime() === job.expirationDate.getTime() && p.expiresAt >= today) {
          if (pref?.inAppEnabled)
            await this.db.notification.upsert({
              where: { deliveryId: job.id },
              create: {
                deliveryId: job.id,
                userId: p.userId,
                productId: p.id,
                title: `Warranty reminder: ${p.name}`,
                message,
              },
              update: {},
            });
          if (pref?.emailEnabled && p.user.emailVerifiedAt)
            await this.mail.send(p.user.email, `Warranty reminder: ${p.name}`, message, job.id);
        }
        await this.db.reminderDelivery.update({
          where: { id: job.id },
          data: { status: 'SENT', sentAt: now, lastError: null },
        });
      } catch {
        this.logger.warn(`Reminder ${job.id} failed; retry scheduled`);
        await this.db.reminderDelivery.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            lastError: 'Delivery failed',
            nextAttemptAt: new Date(now.getTime() + Math.min(1440, 2 ** job.attempts * 5) * 60000),
          },
        });
      }
    }
  }
}
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private db: Database) {}
  @Get() async list(@Req() req: AuthRequest, @Query() q: ListDto) {
    const where = { userId: req.userId };
    const [data, total, unread] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { data, total, unread, page: q.page, limit: q.limit };
  }
  @Patch('read-all') async all(@Req() req: AuthRequest) {
    await this.db.notification.updateMany({
      where: { userId: req.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Patch(':id/read') async read(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.notification.updateMany({
      where: { id, userId: req.userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Get('history') async history(@Req() req: AuthRequest, @Query() q: ListDto) {
    const where = { product: { userId: req.userId } };
    const [data, total] = await this.db.$transaction([
      this.db.reminderDelivery.findMany({
        where,
        select: {
          id: true,
          daysBefore: true,
          status: true,
          attempts: true,
          sentAt: true,
          createdAt: true,
          product: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.reminderDelivery.count({ where }),
    ]);
    return { data, total, page: q.page, limit: q.limit };
  }
}
@Module({
  controllers: [NotificationsController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
