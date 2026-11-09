import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Configuración HTTP compartida por main.ts y las pruebas de integración. */
export function configurarApp(app: INestApplication) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('api/v1');
  return app;
}
