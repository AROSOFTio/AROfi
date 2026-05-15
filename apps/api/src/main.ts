import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  assertRequiredProductionConfig()
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
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
  await app.listen(Number.parseInt(process.env.PORT ?? '3000', 10));
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
  if (process.env.NODE_ENV !== 'production') {
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

  if ((process.env.PAYMENT_DEFAULT_PROVIDER ?? 'PESAPAL') === 'PESAPAL') {
    required.push('PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_IPN_ID')
  }

  const missing = required.filter((key) => !process.env[key] || process.env[key]?.startsWith('change_'))
  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`)
  }
}
