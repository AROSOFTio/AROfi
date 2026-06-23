const fs = require('fs');

let tpl = fs.readFileSync('apps/api/src/modules/routers/login-template.html', 'utf8');

// We need to inject tpl into a TS template literal: return `...`
// 1. Escape backslashes: \ -> \\
tpl = tpl.replace(/\\/g, '\\\\');
// 2. Escape backticks: ` -> \`
tpl = tpl.replace(/`/g, '\\`');
// 3. Escape ${} so they are not evaluated by TS, EXCEPT for apiBaseUrl and escapedKey
tpl = tpl.replace(/\$\{/g, '\\${');
tpl = tpl.replace(/\\\$\{apiBaseUrl\}/g, '${apiBaseUrl}');
tpl = tpl.replace(/\\\$\{escapedKey\}/g, '${escapedKey}');

let lines = fs.readFileSync('apps/api/src/modules/routers/mikrotik.service.ts', 'utf8').split('\n');

let start = -1;
let end = -1;

for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {')) {
    start = i;
  }
  if (start !== -1 && i > start && lines[i].includes('// Brings up an OPEN customer SSID')) {
    end = i - 1;
    break;
  }
}

if(start !== -1 && end !== -1) {
  const newMethod = `  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {
    const apiBaseUrl = this.escapeHtml(this.resolveApiBaseUrl())
    const escapedKey = this.escapeHtml(registrationKey)

    // Self-contained white-themed static portal served directly from the router's
    // hotspot directory. No redirect — works in Android/iOS captive portal browsers.
    // MikroTik replaces $(mac), $(ip), $(link-login-only), $(link-orig), $(server-name)
    // before sending this HTML to the device.
    return \`
${tpl}
\`
  }
`;
  lines.splice(start, end - start, newMethod);
  fs.writeFileSync('apps/api/src/modules/routers/mikrotik.service.ts', lines.join('\n'));
  console.log('Successfully injected.');
} else {
  console.log('Not found:', start, end);
}
