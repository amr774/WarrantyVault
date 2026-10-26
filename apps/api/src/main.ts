import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app';
import { configure } from './bootstrap';
import { config } from './config';
async function main() {
  const app = await NestFactory.create(AppModule);
  configure(app);
  if (config.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('WarrantyVault API')
        .setVersion('1.0')
        .addCookieAuth('access')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  await app.listen(config.PORT, '0.0.0.0');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
