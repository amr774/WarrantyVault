import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app';
import { configure } from './bootstrap';
import { config } from './config';
test('authentication endpoint returns 429 after ten requests per minute', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  configure(app);
  await app.init();
  try {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', config.WEB_URL)
        .send({})
        .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', config.WEB_URL)
      .send({})
      .expect(429);
  } finally {
    await app.close();
  }
});
