import * as cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
  app.enableCors({
    origin: frontendUrl.split(',').map((u) => u.trim()),
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // PORT is what most hosts (Railway, Render, Fly, …) inject; APP_PORT is the
  // project's own convention used by docker-compose. Bind 0.0.0.0 so the
  // container is reachable from outside its own network namespace.
  const port = process.env.PORT ?? process.env.APP_PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on port ${port}`);
}

void bootstrap();
