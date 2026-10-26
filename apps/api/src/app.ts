import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { Database, DatabaseModule } from './database';
import { AuthModule } from './auth';
import { ProductsModule } from './products';
import { StorageModule } from './storage';
import { MailModule } from './mail';
import { RemindersModule } from './reminders';
import { UsersModule } from './users';
import { ScannerModule } from './scanner';
import { OwnerModule } from './owner';
@Controller('health')
class HealthController {
  constructor(private db: Database) {}
  @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
@Module({
  imports: [
    DatabaseModule,
    MailModule,
    AuthModule,
    ProductsModule,
    StorageModule,
    RemindersModule,
    UsersModule,
    ScannerModule,
    OwnerModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 150 }]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
