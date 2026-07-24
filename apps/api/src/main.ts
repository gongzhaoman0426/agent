import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

async function bootstrap() {
  // better-auth 需要自行读取请求体，禁用全局 bodyParser 后对非 auth 路由手动挂 json 解析
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const jsonParser = express.json({ limit: '10mb' });
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.originalUrl.startsWith('/api/auth')) {
        return next();
      }
      return jsonParser(req, res, next);
    },
  );

  const trustedOrigins = (
    process.env.BETTER_AUTH_TRUSTED_ORIGINS || 'http://localhost:5180'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: trustedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT) || 3003;
  await app.listen(port);
  console.log(`agent-next API 已启动: http://localhost:${port}/api`);
}

void bootstrap();
