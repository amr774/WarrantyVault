import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  MinLength,
  MaxLength,
  IsByteLength,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Response } from 'express';
import { Transform } from 'class-transformer';
import bcrypt from 'bcrypt';
import { Database } from './database';
import { AuthGuard, AuthRequest, AuthService, safeUser } from './auth';
import { StorageModule, StorageService } from './storage';
export class ProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
class PasswordDto {
  @IsString() @MaxLength(72) @IsByteLength(0, 72) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(72) @IsByteLength(0, 72) password!: string;
}
class DeleteDto {
  @IsString() @MaxLength(72) @IsByteLength(0, 72) password!: string;
}
class PreferencesDto {
  @IsBoolean() emailEnabled!: boolean;
  @IsBoolean() inAppEnabled!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(365, { each: true })
  days!: number[];
}
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private db: Database,
    private auth: AuthService,
    private storage: StorageService,
  ) {}
  @Get('me') async me(@Req() req: AuthRequest) {
    return safeUser(await this.db.user.findUniqueOrThrow({ where: { id: req.userId } }));
  }
  @Patch('me') async update(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    return safeUser(await this.db.user.update({ where: { id: req.userId }, data: dto }));
  }
  @Post('change-password') async password(
    @Req() req: AuthRequest,
    @Body() dto: PasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
      throw new BadRequestException('Current password is incorrect');
    await this.db.$transaction([
      this.db.user.update({
        where: { id: req.userId },
        data: { passwordHash: await bcrypt.hash(dto.password, 12) },
      }),
      this.db.refreshToken.deleteMany({ where: { userId: req.userId } }),
    ]);
    this.auth.clear(res);
    return { ok: true };
  }
  @Delete('me') async remove(
    @Req() req: AuthRequest,
    @Body() dto: DeleteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.userId } });
    if (!(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new BadRequestException('Password is incorrect');
    const keys = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.userId}::uuid FOR UPDATE`;
        const files = await tx.receipt.findMany({ where: { product: { userId: req.userId } } });
        const keys = files.map((file) => file.storageKey);
        await this.storage.queueDeletion(tx, keys);
        await tx.user.delete({ where: { id: req.userId } });
        return keys;
      },
      { timeout: 30000 },
    );
    this.auth.clear(res);
    await this.storage.cleanupPending(keys);
    return { ok: true };
  }
  @Get('preferences') preferences(@Req() req: AuthRequest) {
    return this.db.reminderPreference.findUniqueOrThrow({ where: { userId: req.userId } });
  }
  @Patch('preferences') async updatePreferences(
    @Req() req: AuthRequest,
    @Body() dto: PreferencesDto,
  ) {
    const subscription = await this.db.userSubscription.findUniqueOrThrow({
      where: { userId: req.userId },
      include: { plan: true },
    });
    if (
      subscription.plan.code === 'FREE' &&
      JSON.stringify([...dto.days].sort((a, b) => a - b)) !== JSON.stringify([1, 7, 30])
    )
      throw new BadRequestException('Custom reminder days require Premium');
    return this.db.reminderPreference.update({ where: { userId: req.userId }, data: dto });
  }
  @Get('subscription') async subscription(@Req() req: AuthRequest) {
    const sub = await this.db.userSubscription.findUniqueOrThrow({
      where: { userId: req.userId },
      include: { plan: true },
    });
    const products = await this.db.product.count({ where: { userId: req.userId } });
    const storage = await this.db.receipt.aggregate({
      where: { product: { userId: req.userId } },
      _sum: { size: true },
    });
    return {
      plan: { ...sub.plan, storageBytes: Number(sub.plan.storageBytes) },
      usage: { products, storageBytes: storage._sum.size ?? 0 },
      billingAvailable: false,
    };
  }
}
@Module({ imports: [StorageModule], controllers: [UsersController] })
export class UsersModule {}
