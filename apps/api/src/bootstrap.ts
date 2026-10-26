import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';
export function configure(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: { directives: { frameAncestors: ["'self'"] } } }));
  app.use(cookieParser());
  app.enableCors({ origin: config.WEB_URL, credentials: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.WEB_URL)
      return res.status(403).json({ message: 'Untrusted request origin' });
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}
