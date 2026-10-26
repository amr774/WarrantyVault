import {
  BadRequestException,
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Global,
  Injectable,
  Module,
  Post,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength, MaxLength, IsByteLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { Mailer } from './mail';
import { config } from './config';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeUser = (u: {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: string;
}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  emailVerifiedAt: u.emailVerifiedAt,
  role: u.role,
});
export class Credentials {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @IsByteLength(0, 72)
  password!: string;
}
export class Registration extends Credentials {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
export class EmailDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}
export class TokenDto {
  @ApiProperty({ description: 'One-time token from the emailed link' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
export class ResetDto extends TokenDto {
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @IsByteLength(0, 72)
  password!: string;
}
export type AuthRequest = Request & { userId: string };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private db: Database,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    try {
      const payload = this.jwt.verify(req.cookies?.access, { secret: config.JWT_SECRET });
      if (payload.type !== 'access') throw new Error();
      const session = await this.db.refreshToken.findUnique({ where: { id: payload.sid } });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt < new Date() ||
        session.userId !== payload.sub
      )
        throw new Error();
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Please sign in');
    }
  }
}
@Injectable()
export class AuthService {
  constructor(
    private db: Database,
    private jwt: JwtService,
    private mail: Mailer,
  ) {}
  async issue(
    userId: string,
    res: Response,
    familyId: string = randomUUID(),
    db: Prisma.TransactionClient = this.db,
  ) {
    const raw = randomBytes(48).toString('hex');
    const session = await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    const access = await this.jwt.signAsync(
      { sub: userId, sid: session.id, type: 'access' },
      { secret: config.JWT_SECRET, expiresIn: '15m' },
    );
    const options = {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api',
    };
    res.cookie('access', access, { ...options, maxAge: 900000 });
    res.cookie('refresh', raw, { ...options, path: '/api/auth', maxAge: 30 * 86400000 });
  }
  clear(res: Response) {
    res.clearCookie('access', { path: '/api' });
    res.clearCookie('refresh', { path: '/api/auth' });
  }
  async register(dto: Registration, res: Response) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const plan = await this.db.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });
    let user;
    try {
      user = await this.db.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          subscription: { create: { planId: plan.id } },
          reminderPreference: { create: {} },
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('Unable to register this email');
      throw e;
    }
    await this.verification(user.id);
    await this.issue(user.id, res);
    return safeUser(user);
  }
  async login(dto: Credentials, res: Response) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5S5gVAkJuNCCQnFW7tf.b4i6Te8tPuK',
    );
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    await this.issue(user.id, res);
    return safeUser(user);
  }
  async refresh(raw: string | undefined, res: Response) {
    if (!raw) throw new UnauthorizedException();
    const old = await this.db.refreshToken.findUnique({ where: { tokenHash: hash(raw) } });
    if (!old || old.expiresAt < new Date()) throw new UnauthorizedException();
    const success = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${old.userId}::uuid FOR UPDATE`;
      const claimed = await tx.refreshToken.updateMany({
        where: { id: old.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!claimed.count) {
        await tx.refreshToken.updateMany({
          where: { familyId: old.familyId },
          data: { revokedAt: new Date() },
        });
        return false;
      }
      await this.issue(old.userId, res, old.familyId, tx);
      return true;
    });
    if (!success) {
      this.clear(res);
      throw new UnauthorizedException('Session reuse detected. Sign in again.');
    }
    return { ok: true };
  }
  async verification(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { ok: true };
    const token = randomBytes(32).toString('hex');
    await this.db.emailVerificationToken.create({
      data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 86400000) },
    });
    await this.mail.send(
      user.email,
      'Verify your WarrantyVault email',
      `${config.WEB_URL}/verify-email#token=${token}`,
    );
    return { ok: true };
  }
  async forgot(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await this.mail.send(
        user.email,
        'Reset your WarrantyVault password',
        `${config.WEB_URL}/reset-password#token=${token}`,
      );
    }
    return { message: 'If this email is registered, a reset link has been sent.' };
  }
  async reset(dto: ResetDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.db.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hash(dto.token) },
      });
      if (!token || token.expiresAt < new Date())
        throw new BadRequestException('Invalid or expired link');
      const consumed = await tx.passwordResetToken.deleteMany({ where: { id: token.id } });
      if (!consumed.count) throw new BadRequestException('Link already used');
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.refreshToken.deleteMany({ where: { userId: token.userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId } });
    });
    return { ok: true };
  }
  async verify(token: string) {
    await this.db.$transaction(async (tx) => {
      const row = await tx.emailVerificationToken.findUnique({ where: { tokenHash: hash(token) } });
      if (!row || row.expiresAt < new Date())
        throw new BadRequestException('Invalid or expired link');
      const consumed = await tx.emailVerificationToken.deleteMany({ where: { id: row.id } });
      if (!consumed.count) throw new BadRequestException('Link already used');
      await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    });
    return { ok: true };
  }
}
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(
    private service: AuthService,
    private db: Database,
  ) {}
  @Post('register') register(
    @Body() body: Registration,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.register(body, res);
  }
  @Post('login') login(@Body() body: Credentials, @Res({ passthrough: true }) res: Response) {
    return this.service.login(body, res);
  }
  @Post('refresh') refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.service.refresh(req.cookies?.refresh, res);
  }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.cookies?.refresh)
      await this.db.refreshToken.updateMany({
        where: { tokenHash: hash(req.cookies.refresh) },
        data: { revokedAt: new Date() },
      });
    this.service.clear(res);
    return { ok: true };
  }
  @Get('me') @UseGuards(AuthGuard) async me(@Req() req: AuthRequest) {
    return safeUser(await this.db.user.findUniqueOrThrow({ where: { id: req.userId } }));
  }
  @Post('forgot-password') forgot(@Body() body: EmailDto) {
    return this.service.forgot(body.email);
  }
  @Post('reset-password') reset(@Body() body: ResetDto) {
    return this.service.reset(body);
  }
  @Post('verify-email') verify(@Body() body: TokenDto) {
    return this.service.verify(body.token);
  }
  @Post('resend-verification') @UseGuards(AuthGuard) resend(@Req() req: AuthRequest) {
    return this.service.verification(req.userId);
  }
}
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}
