#!/usr/bin/env node

/*
 * AroFi deployment isolation guard.
 *
 * This runs before Prisma migrations. It exists to stop a desktop/dev runtime
 * from ever targeting the production AroFi deployment by accident.
 *
 * Environments:
 *   desktop    local UI/data only; no live router/provider targets
 *   dev        dev.arofi.net only
 *   production arofi.net only
 */

const mode = String(process.env.AROFI_DEPLOYMENT_ENV || '').trim().toLowerCase();
const allowedModes = new Set(['desktop', 'dev', 'production']);

function fail(message) {
  console.error(`[deployment-lock] BLOCKED: ${message}`);
  process.exit(78);
}

function hostOf(raw, key) {
  if (!raw) return '';
  const value = String(raw).trim();
  if (!value) return '';
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    fail(`${key} is not a valid host/URL: ${value}`);
  }
}

function requireHost(key, expected) {
  const raw = process.env[key];
  if (!raw) fail(`${key} is required for ${mode}`);
  const host = hostOf(raw, key);
  if (!expected.has(host)) {
    fail(`${key} points to ${host || '(empty)'}, but ${mode} only allows ${Array.from(expected).join(', ')}`);
  }
}

function requireLocalDb() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail('DATABASE_URL is required');
  const host = hostOf(raw, 'DATABASE_URL');
  const allowed = new Set(['postgres', 'localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  if (!allowed.has(host)) {
    fail(`DATABASE_URL points to ${host}. Desktop/dev must use an isolated local/container PostgreSQL database.`);
  }
}

if (!allowedModes.has(mode)) {
  fail('AROFI_DEPLOYMENT_ENV must be explicitly set to desktop, dev, or production. No default is allowed.');
}

const publicKeys = ['API_PUBLIC_HOST', 'PORTAL_PUBLIC_HOST', 'APP_BASE_URL', 'ADMIN_BASE_URL', 'PORTAL_BASE_URL'];

if (mode === 'desktop') {
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  for (const key of publicKeys) requireHost(key, localHosts);

  requireHost('MIKROTIK_CALLBACK_HTTP_URL', localHosts);
  requireHost('RADIUS_PUBLIC_HOST', localHosts);
  requireHost('VPN_SERVER_IP', localHosts);
  requireLocalDb();

  const mustBeFalse = [
    'ROUTER_PROBE_ENABLED',
    'ROUTER_ALERTS_ENABLED',
    'ACCESS_WORKERS_ENABLED',
    'RADIUS_DB_LISTEN_ENABLED',
    'RADIUS_DISCONNECT_ENABLED',
  ];
  for (const key of mustBeFalse) {
    if (String(process.env[key] || '').toLowerCase() !== 'false') {
      fail(`${key} must be false on desktop so local testing cannot act on live routers.`);
    }
  }
}

if (mode === 'dev') {
  const devHost = new Set(['dev.arofi.net']);
  for (const key of publicKeys) requireHost(key, devHost);
  requireHost('MIKROTIK_CALLBACK_HTTP_URL', devHost);
  requireLocalDb();
}

if (mode === 'production') {
  const prodHost = new Set(['arofi.net']);
  for (const key of publicKeys) requireHost(key, prodHost);

  const callbackHost = hostOf(process.env.MIKROTIK_CALLBACK_HTTP_URL || '', 'MIKROTIK_CALLBACK_HTTP_URL');
  if (callbackHost === 'dev.arofi.net' || callbackHost === 'localhost' || callbackHost === '127.0.0.1' || callbackHost === '::1') {
    fail(`MIKROTIK_CALLBACK_HTTP_URL points to ${callbackHost}; production must never use a dev/local callback.`);
  }
}

console.log(`[deployment-lock] OK: ${mode} environment isolation verified before migrations.`);
