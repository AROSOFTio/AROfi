import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { map, Observable } from 'rxjs';

(BigInt.prototype as any).toJSON = function () {
  const num = Number(this);
  return Number.isSafeInteger(num) ? num : this.toString();
};

/**
 * Defense-in-depth guard for the legacy OTP fallback behavior in AuthService.
 * If SMTP delivery fails in production, AuthService historically attached the
 * generated OTP to the response as `otpFallback`. That turns a second factor
 * into a value returned to the same browser that supplied the password.
 *
 * Fail closed at the HTTP boundary: a production response containing an OTP
 * fallback is converted to a 503 and the OTP never leaves the API process.
 * Development keeps its local-test fallback behavior.
 */
class ProductionOtpFailClosedInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (
          process.env.NODE_ENV === 'production' &&
          data !== null &&
          typeof data === 'object' &&
          Object.prototype.hasOwnProperty.call(data, 'otpFallback')
        ) {
          throw new ServiceUnavailableException(
            'Verification email could not be delivered. Please try again.',
          );
        }
        return data;
      }),
    );
  }
}

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
  app.useGlobalInterceptors(new ProductionOtpFailClosedInterceptor());

  // CSRF defense for cookie-authenticated admin writes. SameSite=Lax is useful,
  // but subdomains are still considered same-site; a compromised non-admin
  // subdomain must not be able to submit authenticated state-changing requests.
  // Bearer-token API clients are unaffected because this only applies when the
  // admin session cookie is present.
  app.use(
    (
      req: {
        method?: string;
        headers?: Record<string, string | string[] | undefined>;
      },
      res: {
        status: (code: number) => { json: (body: Record<string, unknown>) => unknown };
      },
      next: () => void,
    ) => {
      if (process.env.NODE_ENV === 'development') {
        next();
        return;
      }

      const method = (req.method ?? 'GET').toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        next();
        return;
      }

      const rawCookie = req.headers?.cookie;
      const cookie = Array.isArray(rawCookie) ? rawCookie.join(';') : rawCookie ?? '';
      const hasAdminCookie = /(?:^|;\s*)arofi_admin_token=/.test(cookie);
      if (!hasAdminCookie) {
        next();
        return;
      }

      const rawOrigin = req.headers?.origin;
      const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
      if (origin && isTrustedAdminOrigin(origin)) {
        next();
        return;
      }

      // Some browser navigations omit Origin but include a browser-controlled
      // Referer. Accept it only when its exact origin is trusted.
      const rawReferer = req.headers?.referer;
      const referer = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;
      if (referer) {
        try {
          if (isTrustedAdminOrigin(new URL(referer).origin)) {
            next();
            return;
          }
        } catch {
          // Fall through to the fail-closed rejection below.
        }
      }

      res.status(403).json({
        statusCode: 403,
        message: 'Cross-site authenticated request blocked',
        error: 'Forbidden',
      });
    },
  );

  // Two-tier CORS. Only explicit admin origins get credentials. Captive portal
  // origins (private LAN IPs, wifi.login) remain uncredentialed.
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

const DEFAULT_TRUSTED_ADMIN_ORIGINS = new Set([
  'https://arofi.net',
  'https://www.arofi.net',
]);

function configuredTrustedAdminOrigins() {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const adminBaseUrl = process.env.ADMIN_BASE_URL?.trim();
  if (adminBaseUrl) {
    try {
      configured.push(new URL(adminBaseUrl).origin);
    } catch {
      // Invalid ADMIN_BASE_URL is handled by the caller as simply untrusted.
    }
  }

  return new Set([...DEFAULT_TRUSTED_ADMIN_ORIGINS, ...configured]);
}

// Origins that may make CREDENTIALED requests (admin session cookie).
// Deliberately exact-match only: trusting every *.arofi.net subdomain turns
// any compromised store/blog/legacy subdomain into part of the admin boundary.
function isTrustedAdminOrigin(origin: string) {
  // Explicit local-dev bypass — NODE_ENV must literally be "development",
  // not merely "not production" (unset/typo'd/staging NODE_ENV must still
  // enforce the allowlist below).
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  return configuredTrustedAdminOrigins().has(normalizedOrigin);
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
    return (
      !value ||
      value.startsWith('change_') ||
      value.startsWith('replace_with') ||
      value.startsWith('CHANGE_ME') ||
      value.startsWith('dev-')
    )
  })
  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`)
  }
}
