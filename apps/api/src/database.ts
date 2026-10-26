import { Global, Injectable, Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ transactionOptions: { maxWait: 15000, timeout: 15000 } });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
