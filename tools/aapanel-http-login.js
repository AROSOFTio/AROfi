const fs = require('fs');
const crypto = require('crypto');

const BASE = 'https://demo.aapanel.com';
const ENTRY = '/fdgi87jbn/';
const USERNAME = process.env.AAPANEL_USERNAME || 'aapanel';
const PASSWORD = process.env.AAPANEL_PASSWORD || 'aapanel';
const OUT_DIR = process.env.AAPANEL_OUT_DIR || 'docs/ui/aapanel-reference/http';

const jar = new Map();

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function storeCookies(headers) {
  const cookies = headers.getSetCookie ? headers.getSetCookie() : headers.get('set-cookie')?.split(/,(?=[^;,]+=)/g) || [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set(
    'user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  );
  headers.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  headers.set('accept-language', 'en-US,en;q=0.9');
  if (jar.size) headers.set('cookie', cookieHeader());
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    redirect: 'manual',
    ...options,
    headers,
  });
  storeCookies(res.headers);
  const text = await res.text();
  return { res, text };
}

function match(html, pattern, name) {
  const found = html.match(pattern);
  if (!found) throw new Error(`Could not find ${name}`);
  return found[1];
}

function rsaEncrypt(value, publicKey) {
  const compact = publicKey
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
    .replace('-----BEGINPUBLICKEY-----', '')
    .replace('-----ENDPUBLICKEY-----', '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${compact.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(value)
  ).toString('base64');
}

function absoluteAsset(src, pagePath) {
  return new URL(src, `${BASE}${pagePath}`).toString();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const loginPage = await request(ENTRY);
  fs.writeFileSync(`${OUT_DIR}/login.html`, loginPage.text);
  const lastToken = match(loginPage.text, /class="last_token"[^>]*data="([^"]*)"/, 'last token');
  const publicKey = match(loginPage.text, /class="public_key"[^>]*data="([^"]*)"/, 'public key');
  const apsess = match(loginPage.text, /class="apsess_token"[^>]*data="([^"]*)"/, 'apsess token');

  const usernameHash = md5(md5(`${USERNAME}${lastToken}`));
  const passwordHash = md5(`${md5(PASSWORD)}_bt.cn`);
  const form = new FormData();
  form.set('username', rsaEncrypt(usernameHash, publicKey));
  form.set('password', rsaEncrypt(passwordHash, publicKey));
  form.set('code', '');
  const login = await request('/login', { method: 'POST', body: form });
  fs.writeFileSync(`${OUT_DIR}/login-response.json`, login.text);

  const appPath = `/apsess_${apsess}/`;
  const app = await request(appPath);
  fs.writeFileSync(`${OUT_DIR}/app.html`, app.text);

  const assetMatches = Array.from(app.text.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)).map((m) =>
    absoluteAsset(m[1], appPath)
  );
  const uniqueAssets = Array.from(new Set(assetMatches));
  const assets = [];
  for (const assetUrl of uniqueAssets) {
    const asset = await request(assetUrl);
    const pathname = new URL(assetUrl).pathname.replace(/^\/+/, '').replace(/[^\w.-]+/g, '_');
    const file = `${OUT_DIR}/${pathname}`;
    fs.writeFileSync(file, asset.text);
    assets.push({ url: assetUrl, file, status: asset.res.status, bytes: asset.text.length });
  }

  const summary = {
    loginStatus: login.res.status,
    loginResponse: login.text,
    appStatus: app.res.status,
    appPath,
    appTitle: app.text.match(/<title>([^<]*)<\/title>/)?.[1] || '',
    cookies: Object.fromEntries(jar),
    assets,
  };
  fs.writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
