import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';

(BigInt.prototype as any).toJSON = function () {
  const num = Number(this);
  return Number.isSafeInteger(num) ? num : this.toString();
};

async function bootstrap() {
  assertRequiredProductionConfig()
  // rawBody is required for HMAC verification of payment provider webhooks
  // (payments.service.ensureWebhookSecret) — the signature is computed over
  // the exact bytes the provider sent, not a re-serialization.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Behind Coolify's reverse proxy, req.ip otherwise resolves to the proxy's
  // own address for every request platform-wide, which collapses the global
  // ThrottlerGuard's per-IP bucket into one shared bucket for all tenants.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(compression({
    level: 5,
    threshold: 1024,
  }));
  // Two-tier CORS. Trusted admin origins (our own domains + the configured
  // allowlist) get credentials so the HttpOnly admin session cookie works
  // cross-subdomain. Hotspot/captive-portal origins (private LAN IPs,
  // wifi.login) only ever call public portal endpoints and are served
  // WITHOUT credentials — a page on a random LAN origin must never be able
  // to ride an admin's session cookie (CSRF/credentialed-CORS hardening).
  app.enableCors((req: { headers: Record<string, string | string[] | undefined> }, callback: (err: Error | null, options?: Record<string, unknown>) => void) => {
    const rawOrigin = req.headers?.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    if (!origin) {
      callback(null, { origin: true, credentials: false });
      return;
    }

    if (isTrustedAdminOrigin(origin)) {
      callback(null, { origin: true, credentials: true });
      return;
    }

    if (isHotspotPortalOrigin(origin)) {
      callback(null, { origin: true, credentials: false });
      return;
    }

    callback(null, { origin: false });
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

// Trusted host suffixes for AROFi's own domains. Must be checked against the
// parsed hostname (exact match or a real subdomain), never via
// origin.includes(suffix) — a substring check lets an attacker register
// e.g. "evil-arofi.net.attacker.com" and pass CORS with credentials.
const TRUSTED_HOST_SUFFIXES = ['arosoftlabs.com', 'arofi.arosoft.io', 'arofi.net'];

// Origins that may make CREDENTIALED requests (admin session cookie).
function isTrustedAdminOrigin(origin: string) {
  // Explicit local-dev bypass — NODE_ENV must literally be "development",
  // not merely "not production" (unset/typo'd/staging NODE_ENV must still
  // enforce the allowlist below).
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(origin)) {
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return TRUSTED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

// Origins that may make UNCREDENTIALED requests only (captive portal pages
// served by the MikroTik hotspot / private LAN). startsWith is safe here —
// a remote attacker's page can't be served from a private IP the victim's
// browser would treat as same-origin, so this can't be spoofed by suffixing.
function isHotspotPortalOrigin(origin: string) {
  if (
    origin.startsWith('http://10.') ||
    origin.startsWith('http://192.168.') ||
    origin.startsWith('http://172.')
  ) {
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return hostname === 'wifi.login' || hostname.endsWith('.wifi.login') || /\.wifi$/i.test(hostname);
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
