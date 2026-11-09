import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3000));
}
void bootstrap();
