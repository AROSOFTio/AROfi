import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  assertRequiredProductionConfig()
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(compression({
    level: 5,
    threshold: 1024,
  }));
  app.enableCors({
    origin: resolveAllowedOrigins(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number.parseInt(process.env.PORT ?? '3000', 10), '0.0.0.0');
}
bootstrap();

function resolveAllowedOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? [] : true
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function assertRequiredProductionConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const isProduction = nodeEnv === 'production'

  // Only enforce strict validation in explicit production mode
  if (!isProduction) {
    return
  }

  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PORTAL_TOKEN_SECRET',
    'ROUTER_CREDENTIAL_SECRET',
    'RADIUS_INTERNAL_API_KEY',
    'RADIUS_SHARED_SECRET',
  ]

  // Payment provider credentials are validated by provider adapters at request time.
  // The API must still boot so admins can configure keys and vendors can use
  // non-payment workflows while MTN/Airtel credentials are pending.
  const missing = required.filter((key) => {
    const value = process.env[key]
    return !value || value.startsWith('change_') || value.startsWith('replace_with') || value.startsWith('CHANGE_ME')
  })
  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`)
  }
}
