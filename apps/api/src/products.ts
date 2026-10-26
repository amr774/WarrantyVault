import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  Matches,
  IsNumber,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AuthGuard, AuthRequest } from './auth';
import { Database } from './database';
import { addMonthsClamped, dateOnly, warranty } from './warranty';
import { config } from './config';
export class ProductDto {
  @ApiProperty({ example: 'Studio headphones' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @ValidateIf((_object, value) => value !== undefined)
  brand?: string;
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @ValidateIf((_object, value) => value !== undefined)
  model?: string;
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  serialNumber?: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;
  @ApiProperty({ example: '2026-01-31', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  purchaseDate!: string;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  @IsOptional()
  purchasePrice?: number | null;
  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(150)
  @IsOptional()
  storeName?: string;
  @ApiProperty({ example: 12, minimum: 0, maximum: 1200 })
  @IsInt()
  @Min(0)
  @Max(1200)
  warrantyMonths!: number;
  @ApiPropertyOptional({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  warrantyStartDate?: string | null;
  @ApiPropertyOptional({ format: 'date', description: 'Override the calculated expiration' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ValidateIf((_object, value) => value !== undefined)
  expiresAt?: string;
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @ValidateIf((_object, value) => value !== undefined)
  notes?: string;
}
export class UpdateProductDto extends PartialType(ProductDto, { skipNullProperties: false }) {}
export class ListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 12;
  @IsString() @MaxLength(150) @IsOptional() search?: string;
  @IsUUID() @IsOptional() categoryId?: string;
  @IsIn(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED']) @IsOptional() status?: string;
  @IsIn(['createdAt', 'expiresAt', 'name', 'purchaseDate']) @IsOptional() sort = 'createdAt';
  @IsIn(['asc', 'desc']) @IsOptional() order: 'asc' | 'desc' = 'desc';
}
export function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new BadRequestException('Invalid calendar date');
  return date;
}
@Injectable()
export class ProductsService {
  constructor(private db: Database) {}
  decorate<T extends { expiresAt: Date; purchaseDate: Date; warrantyStartDate?: Date | null }>(
    p: T,
  ) {
    return {
      ...p,
      ...warranty(p.expiresAt, p.warrantyStartDate ?? p.purchaseDate, config.EXPIRING_SOON_DAYS),
    };
  }
  async owned(userId: string, id: string) {
    const p = await this.db.product.findFirst({
      where: { id, userId },
      include: { category: true, receipts: true },
    });
    if (!p) throw new NotFoundException('Product not found');
    return this.decorate(p);
  }
  async list(userId: string, q: ListDto) {
    const today = dateOnly(new Date());
    const soon = new Date(today.getTime() + config.EXPIRING_SOON_DAYS * 86400000);
    const where: Prisma.ProductWhereInput = {
      userId,
      categoryId: q.categoryId,
      ...(q.search
        ? {
            OR: ['name', 'brand', 'model', 'serialNumber'].map((field) => ({
              [field]: { contains: q.search, mode: 'insensitive' },
            })),
          }
        : {}),
      ...(q.status
        ? {
            expiresAt:
              q.status === 'EXPIRED'
                ? { lt: today }
                : q.status === 'ACTIVE'
                  ? { gt: soon }
                  : { gte: today, lte: soon },
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        include: { category: true, _count: { select: { receipts: true } } },
        orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.product.count({ where }),
    ]);
    return { data: data.map((p) => this.decorate(p)), total, page: q.page, limit: q.limit };
  }
  async create(
    userId: string,
    dto: ProductDto,
    receipt?: { storageKey: string; name: string; mimeType: string; size: number },
  ) {
    const purchaseDate = validDate(dto.purchaseDate);
    const warrantyStartDate = dto.warrantyStartDate ? validDate(dto.warrantyStartDate) : null;
    const expiresAt = dto.expiresAt
      ? validDate(dto.expiresAt)
      : addMonthsClamped(warrantyStartDate ?? purchaseDate, dto.warrantyMonths);
    if (expiresAt < purchaseDate || (warrantyStartDate && expiresAt < warrantyStartDate))
      throw new BadRequestException('Expiration cannot precede purchase');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const subscription = await tx.userSubscription.findUniqueOrThrow({
        where: { userId },
        include: { plan: true },
      });
      const count = await tx.product.count({ where: { userId } });
      if (count >= subscription.plan.productLimit)
        throw new ForbiddenException('Your plan product limit has been reached');
      if (!(await tx.category.findUnique({ where: { id: dto.categoryId } })))
        throw new BadRequestException('Unknown category');
      if (receipt) {
        const used = await tx.receipt.aggregate({
          where: { product: { userId } },
          _sum: { size: true },
        });
        if (BigInt((used._sum.size ?? 0) + receipt.size) > subscription.plan.storageBytes)
          throw new ForbiddenException('Storage quota reached');
      }
      const p = await tx.product.create({
        data: {
          ...dto,
          userId,
          purchaseDate,
          warrantyStartDate,
          expiresAt,
          expirationOverride: !!dto.expiresAt,
          ...(receipt ? { receipts: { create: { ...receipt, kind: 'RECEIPT' } } } : {}),
        },
        include: { category: true },
      });
      return this.decorate(p);
    });
  }
  async update(userId: string, id: string, dto: UpdateProductDto) {
    const old = await this.owned(userId, id);
    const purchaseDate = dto.purchaseDate ? validDate(dto.purchaseDate) : old.purchaseDate;
    const warrantyStartDate =
      dto.warrantyStartDate === null
        ? null
        : dto.warrantyStartDate
          ? validDate(dto.warrantyStartDate)
          : old.warrantyStartDate;
    const months = dto.warrantyMonths ?? old.warrantyMonths;
    const expiresAt = dto.expiresAt
      ? validDate(dto.expiresAt)
      : dto.purchaseDate !== undefined ||
          dto.warrantyMonths !== undefined ||
          dto.warrantyStartDate !== undefined
        ? addMonthsClamped(warrantyStartDate ?? purchaseDate, months)
        : old.expiresAt;
    if (expiresAt < purchaseDate || (warrantyStartDate && expiresAt < warrantyStartDate))
      throw new BadRequestException('Expiration cannot precede purchase');
    if (dto.categoryId && !(await this.db.category.findUnique({ where: { id: dto.categoryId } })))
      throw new BadRequestException('Unknown category');
    return this.decorate(
      await this.db.product.update({
        where: { id, userId },
        data: {
          ...dto,
          purchaseDate,
          warrantyStartDate,
          expiresAt,
          expirationOverride: dto.expiresAt
            ? true
            : dto.purchaseDate ||
                dto.warrantyMonths !== undefined ||
                dto.warrantyStartDate !== undefined
              ? false
              : old.expirationOverride,
        },
        include: { category: true, receipts: true },
      }),
    );
  }
}
@Controller('products')
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(
    private service: ProductsService,
    private db: Database,
  ) {}
  @Get() list(@Req() req: AuthRequest, @Query() q: ListDto) {
    return this.service.list(req.userId, q);
  }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.owned(req.userId, id);
  }
  @Post() create(@Req() req: AuthRequest, @Body() dto: ProductDto) {
    return this.service.create(req.userId, dto);
  }
  @Patch(':id') update(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(req.userId, id, dto);
  }
}
@Controller()
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private db: Database,
    private products: ProductsService,
  ) {}
  @Get('categories') categories() {
    return this.db.category.findMany({ orderBy: { name: 'asc' } });
  }
  @Get('dashboard/summary') async summary(@Req() req: AuthRequest) {
    const rows = await this.db.product.findMany({
      where: { userId: req.userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    const products = rows.map((p) => this.products.decorate(p));
    return {
      total: products.length,
      active: products.filter((p) => p.status === 'ACTIVE').length,
      expiring: products.filter((p) => p.status === 'EXPIRING_SOON').length,
      expired: products.filter((p) => p.status === 'EXPIRED').length,
      recent: products.slice(0, 5),
      categories: Object.entries(
        products.reduce(
          (a, p) => ({ ...a, [p.category.name]: (a[p.category.name] ?? 0) + 1 }),
          {} as Record<string, number>,
        ),
      ).map(([name, value]) => ({ name, value })),
    };
  }
  @Get('dashboard/upcoming-expirations') upcoming(@Req() req: AuthRequest) {
    return this.products.list(
      req.userId,
      Object.assign(new ListDto(), {
        status: 'EXPIRING_SOON',
        sort: 'expiresAt',
        order: 'asc',
        limit: 5,
      }),
    );
  }
}
@Module({
  controllers: [ProductsController, DashboardController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
