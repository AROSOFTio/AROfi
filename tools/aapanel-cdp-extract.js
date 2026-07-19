const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const CDP_HOST = process.env.CDP_HOST || '127.0.0.1';
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const DEMO_URL = process.env.AAPANEL_DEMO_URL || 'https://demo.aapanel.com/fdgi87jbn/';
const USERNAME = process.env.AAPANEL_USERNAME || 'aapanel';
const PASSWORD = process.env.AAPANEL_PASSWORD || 'aapanel';
const OUT_DIR = process.env.AAPANEL_OUT_DIR || 'docs/ui/aapanel-reference';

function httpJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: CDP_HOST, port: CDP_PORT, path, method: path.startsWith('/json/new') ? 'PUT' : 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${path}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function encodeFrame(payload) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x81;
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

class CDP {
  constructor(wsUrl) {
    const url = new URL(wsUrl);
    this.host = url.hostname;
    this.port = Number(url.port);
    this.path = `${url.pathname}${url.search}`;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.connect(this.port, this.host, () => {
        const key = crypto.randomBytes(16).toString('base64');
        this.socket.write(
          `GET ${this.path} HTTP/1.1\r\n` +
            `Host: ${this.host}:${this.port}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${key}\r\n` +
            'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });
      this.socket.once('error', reject);
      this.socket.once('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (!text.includes('101 Switching Protocols')) {
          reject(new Error(`WebSocket upgrade failed: ${text.slice(0, 200)}`));
          return;
        }
        const marker = Buffer.from('\r\n\r\n');
        const index = chunk.indexOf(marker);
        if (index !== -1 && index + marker.length < chunk.length) {
          this.buffer = Buffer.concat([this.buffer, chunk.slice(index + marker.length)]);
          this.drain();
        }
        this.socket.on('data', (data) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this.drain();
        });
        resolve();
      });
    });
  }

  drain() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      let offset = 2;
      let len = second & 0x7f;
      if (len === 126) {
        if (this.buffer.length < offset + 2) return;
        len = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (this.buffer.length < offset + 8) return;
        len = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }
      const masked = Boolean(second & 0x80);
      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + len) return;
      let payload = this.buffer.slice(offset, offset + len);
      this.buffer = this.buffer.slice(offset + len);
      if (masked) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4];
        payload = unmasked;
      }
      const opcode = first & 0x0f;
      if (opcode === 0x8) return;
      if (opcode !== 0x1) continue;
      const msg = JSON.parse(payload.toString('utf8'));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(encodeFrame(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  close() {
    this.socket.end();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(cdp, expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.result && result.result.value) return result.result.value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  }
  return result.result.value;
}

async function screenshot(cdp, name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await sleep(600);
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = `${OUT_DIR}/${name}-${width}x${height}.png`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  return file;
}

async function main() {
  let targets = await httpJson('/json/list');
  let target = targets.find((item) => item.type === 'page');
  if (!target) target = await httpJson(`/json/new?${encodeURIComponent('about:blank')}`);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Page.navigate', { url: DEMO_URL });
  await waitFor(cdp, 'document.readyState === "complete"', 30000);
  await waitFor(cdp, 'Boolean(document.querySelector("#username") && document.querySelector("#password") && document.querySelector(".login_btn"))', 30000);
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('#username').value = ${JSON.stringify(USERNAME)};
      document.querySelector('#password').value = ${JSON.stringify(PASSWORD)};
      document.querySelector('.login_btn').click();
      return true;
    })()`
  );
  await waitFor(cdp, 'location.href.includes("/apsess_") || Boolean(document.querySelector(".bt-w-menu, .sidebar, .layout, .main-content, #app"))', 30000);
  await sleep(3500);

  const extraction = await evaluate(
    cdp,
    `(() => {
      const q = (selector) => document.querySelector(selector);
      const qa = (selector) => Array.from(document.querySelectorAll(selector));
      const css = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          selector: el.__aaSelector || '',
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ''),
          text: (el.innerText || el.value || '').trim().slice(0, 80),
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          color: s.color,
          backgroundColor: s.backgroundColor,
          borderColor: s.borderColor,
          borderTopColor: s.borderTopColor,
          borderWidth: s.borderWidth,
          borderRadius: s.borderRadius,
          boxShadow: s.boxShadow,
          padding: s.padding,
          margin: s.margin,
          width: Math.round(r.width * 100) / 100 + 'px',
          height: Math.round(r.height * 100) / 100 + 'px',
          display: s.display,
          alignItems: s.alignItems,
          transitionDuration: s.transitionDuration,
          opacity: s.opacity,
        };
      };
      const pick = (name, selectors) => {
        for (const selector of selectors) {
          const el = q(selector);
          if (el) {
            el.__aaSelector = selector;
            return [name, css(el)];
          }
        }
        return [name, null];
      };
      const sampleSelectors = [
        ['html', ['html']],
        ['body', ['body']],
        ['appRoot', ['#app', '#container', '.container-fluid', '.bt-layout', '.layout']],
        ['sidebar', ['.bt-w-menu', '.sidebar', '.layout-side', '.side-menu']],
        ['sidebarLogo', ['.bt-w-menu .menu-title', '.sidebar .logo', '.layout-logo']],
        ['navItem', ['.bt-w-menu a', '.bt-w-menu li', '.side-menu a', '.el-menu-item']],
        ['navItemActive', ['.bt-w-menu .active', '.bt-w-menu li.active', '.side-menu .active', '.el-menu-item.is-active']],
        ['submenuItem', ['.bt-w-menu .submenu a', '.bt-w-menu .two a', '.el-sub-menu .el-menu-item']],
        ['topbar', ['.bt-top', '.top-bar', '.layout-header', '.header']],
        ['content', ['.bt-main', '.main-content', '.layout-main', '.main']],
        ['panel', ['.bt-panel', '.panel', '.box-card', '.el-card']],
        ['card', ['.overview-card', '.site-card', '.soft-card', '.el-card']],
        ['table', ['table', '.el-table']],
        ['tableHeader', ['thead th', '.el-table__header th']],
        ['tableRow', ['tbody tr', '.el-table__row']],
        ['input', ['input[type="text"]', '.el-input__inner', 'input']],
        ['select', ['select', '.el-select', '.el-select__wrapper']],
        ['textarea', ['textarea']],
        ['buttonPrimary', ['.btn-success', '.bt-btn-success', '.el-button--primary', 'button[type="submit"]', '.btn-primary']],
        ['buttonDefault', ['.btn-default', '.bt-btn-default', '.el-button', 'button']],
        ['buttonDanger', ['.btn-danger', '.el-button--danger']],
        ['tabs', ['.tabs', '.el-tabs__item', '.tab-nav']],
        ['badge', ['.badge', '.tag', '.el-tag']],
        ['alert', ['.alert', '.el-alert']],
        ['dropdown', ['.dropdown-menu', '.el-dropdown-menu']],
        ['modal', ['.layui-layer', '.el-dialog', '.modal']],
        ['modalOverlay', ['.layui-layer-shade', '.v-modal', '.modal-backdrop']],
        ['tooltip', ['.tooltip', '.el-tooltip__popper']],
        ['pagination', ['.pagination', '.el-pagination']],
      ];
      const samples = Object.fromEntries(sampleSelectors.map(([name, selectors]) => pick(name, selectors)));
      const vars = {};
      const styles = getComputedStyle(document.documentElement);
      for (const name of styles) {
        if (name.startsWith('--')) vars[name] = styles.getPropertyValue(name).trim();
      }
      const links = qa('link[rel="stylesheet"]').map((el) => el.href);
      const scripts = qa('script[src]').map((el) => el.src);
      const titles = qa('h1,h2,h3,h4,.title,.bt-title,.panel-title').slice(0, 20).map(css);
      const buttons = qa('button,.btn,.el-button').slice(0, 30).map(css);
      const inputs = qa('input,textarea,select,.el-input__inner').slice(0, 30).map(css);
      const navItems = qa('.bt-w-menu a,.bt-w-menu li,.side-menu a,.el-menu-item').slice(0, 40).map(css);
      const rects = {
        viewport: { width: innerWidth, height: innerHeight },
        bodyScroll: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      };
      return {
        url: location.href,
        title: document.title,
        lang: document.documentElement.lang,
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        vars,
        stylesheets: links,
        scripts,
        samples,
        titles,
        buttons,
        inputs,
        navItems,
        rects,
      };
    })()`
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(`${OUT_DIR}/computed-styles.json`, JSON.stringify(extraction, null, 2));
  const shots = [];
  for (const [w, h] of [
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ]) {
    shots.push(await screenshot(cdp, 'aapanel-authenticated', w, h));
  }
  fs.writeFileSync(`${OUT_DIR}/screenshots.json`, JSON.stringify(shots, null, 2));
  console.log(JSON.stringify({ url: extraction.url, title: extraction.title, outDir: OUT_DIR, screenshots: shots }, null, 2));
  cdp.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
