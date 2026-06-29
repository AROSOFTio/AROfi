// Must be imported before any other module (Sentry's own requirement) so it
// can instrument Node's http/db clients before they're first used. Safe to
// leave SENTRY_DSN unset: Sentry.init() with no dsn is a documented no-op.
import * as Sentry from '@sentry/nestjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: process.env.SENTRY_DSN ? 0.1 : 0,
})
