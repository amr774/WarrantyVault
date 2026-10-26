import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuthGuard, AuthRequest } from './auth';
import { Database } from './database';
import { ProductsModule, ProductsService } from './products';
import { config } from './config';
export function detectType(b: Buffer) {
  if (b.length < 12) throw new BadRequestException('Invalid file');
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  throw new BadRequestException('Upload a JPG, PNG, WEBP or PDF file');
}
@Injectable()
export class StorageService {
  private logger = new Logger(StorageService.name);
  private s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: !!config.S3_ENDPOINT,
    credentials: config.S3_ACCESS_KEY_ID
      ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY! }
      : undefined,
  });
  constructor(
    private jwt: JwtService,
    private db: Database,
  ) {}
  async queueDeletion(tx: Prisma.TransactionClient, keys: string[]) {
    if (keys.length)
      await tx.pendingFileDeletion.createMany({
        data: keys.map((storageKey) => ({ storageKey })),
        skipDuplicates: true,
      });
  }
  @Cron('0 */5 * * * *', { waitForCompletion: true })
  async retryPendingDeletions() {
    await this.cleanupPending();
  }
  async cleanupPending(keys?: string[]) {
    if (keys && !keys.length) return;
    // The database deletion and this queue commit together. File removal must never
    // run before that commit, because a rollback cannot restore deleted files.
    try {
      const pending = await this.db.pendingFileDeletion.findMany({
        ...(keys ? { where: { storageKey: { in: keys } } } : {}),
        orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
        take: 50,
      });
      for (const job of pending) {
        try {
          await this.remove(job.storageKey);
          await this.db.pendingFileDeletion.deleteMany({ where: { storageKey: job.storageKey } });
        } catch {
          this.logger.warn('Private document cleanup failed; queued for retry');
          await this.db.pendingFileDeletion
            .updateMany({
              where: { storageKey: job.storageKey },
              data: { attempts: { increment: 1 } },
            })
            .catch(() => this.logger.warn('Could not record cleanup attempt; queue retained'));
        }
      }
    } catch {
      // A committed user deletion still succeeds while storage or the retry queue
      // is temporarily unavailable. The durable queue is retried by the scheduler.
      this.logger.warn('Private document cleanup unavailable; queued files retained');
    }
  }
  async put(key: string, body: Buffer, type: string) {
    if (config.STORAGE_DRIVER === 's3')
      await this.s3.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: type,
          ServerSideEncryption: 'AES256',
        }),
      );
    else {
      await mkdir(config.LOCAL_STORAGE_PATH, { recursive: true });
      await writeFile(resolve(config.LOCAL_STORAGE_PATH, key), body);
    }
  }
  async remove(key: string) {
    if (config.STORAGE_DRIVER === 's3')
      await this.s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    else
      await unlink(resolve(config.LOCAL_STORAGE_PATH, key)).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
  }
  async url(id: string, key: string, type: string) {
    if (config.STORAGE_DRIVER === 's3')
      return getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          ResponseContentType: type,
          ResponseContentDisposition: 'inline',
          ResponseCacheControl: 'no-store',
        }),
        { expiresIn: 60 },
      );
    const token = this.jwt.sign(
      { rid: id, type: 'receipt' },
      { secret: config.JWT_SECRET, expiresIn: '60s' },
    );
    return `/api/receipts/${id}/content?token=${token}`;
  }
  read(key: string) {
    return readFile(resolve(config.LOCAL_STORAGE_PATH, key));
  }
}
@Controller()
@UseGuards(AuthGuard)
export class ReceiptsController {
  constructor(
    private db: Database,
    private products: ProductsService,
    private storage: StorageService,
    private jwt: JwtService,
  ) {}
  @Delete('products/:id') async removeProduct(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const keys = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.userId}::uuid FOR UPDATE`;
        const p = await tx.product.findFirst({
          where: { id, userId: req.userId },
          include: { receipts: true },
        });
        if (!p) throw new NotFoundException('Product not found');
        const keys = p.receipts.map((file) => file.storageKey);
        await this.storage.queueDeletion(tx, keys);
        await tx.product.delete({ where: { id } });
        return keys;
      },
      { timeout: 30000 },
    );
    await this.storage.cleanupPending(keys);
    return { ok: true };
  }
  @Get('products/:id/receipts') async list(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return (await this.products.owned(req.userId, id)).receipts;
  }
  @Post('products/:id/receipts')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 } }),
  )
  async upload(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('kind') kind = 'RECEIPT',
  ) {
    await this.products.owned(req.userId, id);
    if (!file) throw new BadRequestException('Choose a file');
    const mimeType = detectType(file.buffer);
    if (
      !['RECEIPT', 'IMAGE'].includes(kind) ||
      (kind === 'IMAGE' && !mimeType.startsWith('image/'))
    )
      throw new BadRequestException('Invalid image');
    const key = randomUUID();
    await this.storage.put(key, file.buffer, mimeType);
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.userId}::uuid FOR UPDATE`;
        const plan = await tx.userSubscription.findUniqueOrThrow({
          where: { userId: req.userId },
          include: { plan: true },
        });
        const size = await tx.receipt.aggregate({
          where: { product: { userId: req.userId } },
          _sum: { size: true },
        });
        if (BigInt((size._sum.size ?? 0) + file.size) > plan.plan.storageBytes)
          throw new ForbiddenException('Storage quota reached');
        return tx.receipt.create({
          data: {
            productId: id,
            storageKey: key,
            name: file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200),
            mimeType,
            size: file.size,
            kind,
          },
        });
      });
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
  }
  async owned(userId: string, id: string) {
    const row = await this.db.receipt.findFirst({ where: { id, product: { userId } } });
    if (!row) throw new NotFoundException('Receipt not found');
    return row;
  }
  @Get('receipts/:id/download') async download(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const row = await this.owned(req.userId, id);
    return {
      url: await this.storage.url(id, row.storageKey, row.mimeType),
      name: row.name,
      mimeType: row.mimeType,
    };
  }
  @Get('receipts/:id/content') async content(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const row = await this.owned(req.userId, id);
    try {
      const payload = this.jwt.verify(token, { secret: config.JWT_SECRET });
      if (payload.rid !== id || payload.type !== 'receipt' || config.STORAGE_DRIVER !== 'local')
        throw new Error();
    } catch {
      throw new ForbiddenException('Link expired');
    }
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(await this.storage.read(row.storageKey));
  }
  @Delete('receipts/:id') async remove(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const key = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.userId}::uuid FOR UPDATE`;
      const row = await tx.receipt.findFirst({ where: { id, product: { userId: req.userId } } });
      if (!row) throw new NotFoundException('Receipt not found');
      await this.storage.queueDeletion(tx, [row.storageKey]);
      await tx.receipt.delete({ where: { id } });
      return row.storageKey;
    });
    await this.storage.cleanupPending([key]);
    return { ok: true };
  }
}
@Module({
  imports: [ProductsModule],
  controllers: [ReceiptsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
