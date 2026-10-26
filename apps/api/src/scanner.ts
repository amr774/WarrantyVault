import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { AuthGuard, AuthRequest } from './auth';
import { ProductDto, ProductsModule, ProductsService } from './products';
import { detectType, StorageModule, StorageService } from './storage';
import { config } from './config';

const upload = FileInterceptor('file', {
  limits: {
    fileSize: Math.min(config.MAX_UPLOAD_BYTES, 10485760),
    files: 1,
    fields: 1,
    fieldSize: 16000,
  },
});
const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('scanner')
@UseGuards(AuthGuard)
export class ScannerController {
  constructor(
    private products: ProductsService,
    private storage: StorageService,
  ) {}
  private async process(file: Express.Multer.File, validateOnly = false) {
    if (!file) throw new BadRequestException('Choose a document');
    const mimeType = detectType(file.buffer);
    // Fixed loopback destination: no arbitrary URL, external provider or proxy.
    let response: globalThis.Response;
    try {
      response = await fetch(`http://127.0.0.1:8100/analyze?validate_only=${validateOnly}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(file.buffer),
        signal: AbortSignal.timeout(180000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Local OCR service unavailable or timed out. Start services/ocr/service.py and retry. Your document has not been saved.',
      );
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new HttpException(
        detail.detail ?? 'Local document processing failed',
        [400, 413, 422, 429].includes(response.status) ? response.status : 503,
      );
    }
    return { mimeType, result: await response.json() };
  }
  @Post('analyze')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @UseInterceptors(upload)
  async analyze(@UploadedFile() file: Express.Multer.File) {
    return (await this.process(file)).result;
  }
  @Post('confirm')
  @UseInterceptors(upload)
  async confirm(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('product') product: string,
  ) {
    let raw: unknown;
    try {
      raw = JSON.parse(product);
    } catch {
      throw new BadRequestException('Invalid product details');
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Invalid product details');
    const dto = (await validation.transform(raw, {
      type: 'body',
      metatype: ProductDto,
    })) as ProductDto;
    // Validate the original again: callers cannot bypass size/page/decoding limits at save.
    const { mimeType } = await this.process(file, true);
    const storageKey = randomUUID();
    // Scanner documents must stay local even if other app uploads use S3.
    if (config.STORAGE_DRIVER !== 'local')
      throw new BadRequestException('Local receipt storage must be enabled for scanning');
    await this.storage.put(storageKey, file.buffer, mimeType);
    try {
      return await this.products.create(req.userId, dto, {
        storageKey,
        mimeType,
        size: file.size,
        name: file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200),
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }
}
@Module({ imports: [ProductsModule, StorageModule], controllers: [ScannerController] })
export class ScannerModule {}
