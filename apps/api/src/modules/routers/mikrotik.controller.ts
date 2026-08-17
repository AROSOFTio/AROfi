import { Controller, Get, Header, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { RoutersService } from './routers.service';

@Controller('mikrotik')
export class MikrotikController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('script/:key')
  @Header('Content-Type', 'text/plain')
  async getProvisioningScript(@Param('key') key: string) {
    const script = await this.routersService.getProvisioningScriptByKey(key);
    if (!script) {
      throw new NotFoundException('Router provisioning script not found');
    }
    return script;
  }

  @Get('login-html/:key')
  @Header('Content-Type', 'text/html')
  async getLoginHtml(@Param('key') key: string) {
    const html = await this.routersService.getMikrotikLoginHtmlByKey(key);
    if (!html) {
      throw new NotFoundException('Router login.html not found');
    }

    return this.prepareLoginHtml(html);
  }

  @Get('status-html/:key')
  @Header('Content-Type', 'text/html')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getStatusHtml(@Param('key') key: string) {
    const html = await this.routersService.getMikrotikStatusHtmlByKey(key);
    if (!html) {
      throw new NotFoundException('Router status.html not found');
    }
    return this.prepareCompletionHtml(html);
  }

  @Get('mobile-setup/:key')
  async getMobileSetup(@Param('key') key: string) {
    const summary = await this.routersService.getMobileSetupSummaryByKey(key);
    if (!summary) {
      throw new NotFoundException('Router not found');
    }
    return summary;
  }

  @Get('remote-access/install')
  @Header('Content-Type', 'text/plain')
  async getRemoteAccessInstall(@Query('token') token?: string, @Req() request?: any) {
    const authHeader = request?.headers?.['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    const activeToken = token || bearerToken;
    if (!activeToken) {
      throw new NotFoundException('Token not provided');
    }

    const script = await this.routersService.getRemoteAccessInstallScript(activeToken);
    if (!script) {
      throw new NotFoundException('Remote access configuration not found');
    }
    return script;
  }

  @Get('remote-access/install/:token')
  @Header('Content-Type', 'text/plain')
  async getRemoteAccessInstallWithParam(@Param('token') token: string, @Req() request?: any) {
    return this.getRemoteAccessInstall(token, request);
  }

  @Get('provisioned/:key')
  async markProvisioned(
    @Param('key') key: string,
    @Req() request: any,
    @Query('nasIp') selfReportedNasIp?: string,
  ) {
    const httpSourceIp = this.resolveSourceIp(request);
    const sourceIp = this.resolveProvisioningNasIp(selfReportedNasIp, httpSourceIp);
    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  @Get('heartbeat/:key')
  async heartbeat(
    @Param('key') key: string,
    @Req() request: any,
    @Query('activeUsers') activeUsers?: string,
    @Query('activeMacs') activeMacs?: string,
  ) {
    const sourceIp = this.resolveSourceIp(request);
    const result = await this.routersService.recordRouterHeartbeatByKey(key, sourceIp, activeUsers, activeMacs);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  // Public because the captive-flow initializer wraps this method to preserve
  // the direct HTTP POST login flow without using MAC authentication.
  prepareLoginHtml(html: string) {
    let prepared = html;

    prepared = this.replaceFirst(
      prepared,
      /var autoReady\s*=\s*d\.returningDevice&&d\.returningDevice\.existingActiveAccess&&d\.returningDevice\.reconnect\s*;/,
      'var autoReady=false;',
    );

    prepared = this.replaceFirst(
      prepared,
      /function apiCall\(m,p,d,cb\)\{ajax\(m,API\+p,d,function\(e,r\)\{if\(e\)ajax\(m,APIFB\+p,d,cb\);else cb\(null,r\);\}\);\}/,
      `function apiCall(m,p,d,cb){ajax(m,API+p,d,function(e,r){if(!e){cb(null,r);return;}ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(new Error((fe&&fe.message)||(e&&e.message)||'Unable to reach the AROFi voucher service.'));});});}`,
    );

    prepared = this.replaceFirst(
      prepared,
      /function ajax\(method, url, data, cb\)\{[\s\S]*?\n    \}/,
      `function ajax(method, url, data, cb){
      var x=new XMLHttpRequest();
      x.open(method, url, true);
      if(data) x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){
        var raw=x.responseText||'',j=null;
        try{j=raw?JSON.parse(raw):{};}catch(e){}
        if(x.status>=200&&x.status<300){cb(null,j||{});return;}
        var msg=j&&j.message;
        if(Object.prototype.toString.call(msg)==='[object Array]')msg=msg.join('. ');
        if(!msg&&j&&j.error)msg=j.error;
        if(!msg&&raw&&raw.charAt(0)!=='<')msg=raw.substring(0,240);
        if(!msg&&x.status===429)msg='Too many voucher attempts. Wait one minute and try again.';
        if(!msg)msg='Voucher request failed (HTTP '+x.status+').';
        cb(new Error(String(msg)));
      };
      x.onerror=function(){cb(new Error('Cannot reach the AROFi voucher service. Keep this WiFi connected and try again.'));};
      x.ontimeout=function(){cb(new Error('The voucher service took too long to respond. Try again.'));};
      x.timeout=12000;
      x.send(data?JSON.stringify(data):null);
    }`,
    );

    prepared = this.replaceFirst(
      prepared,
      /var pkgs=\[\],selId=null,selTv=false;?/,
      'var pkgs=[],selId=null,selTv=false,trialStarting=false;',
    );

    prepared = this.replaceFirst(
      prepared,
      /<p class="section-label">Select a package and pay with Mobile Money<\/p>\s*<div class="pkgs" id="plist"><\/div>/,
      `      <div id="trialSection" class="tv-section">
        <p class="section-label">Try WiFi Free</p>
        <p class="section-sub">Start your one-time free trial on this device.</p>
        <div class="pkgs" id="trialList"></div>
      </div>

      <p class="section-label">Select a package and pay with Mobile Money</p>
      <div class="pkgs" id="plist"></div>`,
    );

    prepared = this.replaceFirst(
      prepared,
      /function normMac\(v\)\{/,
      `function isTrialPkg(p){
      return !!(p&&(p.isTrialEnabled===true||Number(p.amountUgx||0)<=0||/trial/i.test((p.name||'')+' '+(p.code||''))));
    }

    function normMac(v){`,
    );

    prepared = this.replaceFirst(
      prepared,
      /var el=document\.getElementById\('plist'\);el\.innerHTML='';\s*var tvl=document\.getElementById\('tvList'\);tvl\.innerHTML='';\s*var ml=document\.getElementById\('multiList'\);ml\.innerHTML='';\s*var mc=0,tc=0;\s*pkgs\.forEach\(function\(p\)\{[\s\S]*?document\.getElementById\('multiSection'\)\.style\.display=mc>0\?'block':'none';/,
      `var el=document.getElementById('plist');el.innerHTML='';
        var trl=document.getElementById('trialList');trl.innerHTML='';
        var tvl=document.getElementById('tvList');tvl.innerHTML='';
        var ml=document.getElementById('multiList');ml.innerHTML='';
        var mc=0,tc=0,trc=0;
        pkgs.forEach(function(p){
          var limit=parseInt(p.deviceLimit||1,10)||1;
          var trial=isTrialPkg(p);
          var c=document.createElement('div');c.className='pkg';c.id='pkg-'+p.id;
          var dur=fdur(p.durationMinutes)+(limit>1?' - '+limit+' devices':'');
          var price=trial?'FREE':'UGX '+fn(p.amountUgx);
          var action=trial?'TRY':'BUY';
          c.innerHTML='<span><span class="pk-name">'+esc(p.name)+'</span><span class="pk-dur">'+esc(dur)+'</span></span><span class="pk-price">'+price+'</span><span class="pk-buy">'+action+'</span>';
          c.onclick=function(){if(trial){startTrial(p.id);return;}selPkg(p.id);};
          if(trial){trl.appendChild(c);trc++;}
          else if(isTvPkg(p)){tvl.appendChild(c);tc++;}
          else if(limit>1){ml.appendChild(c);mc++;}
          else{el.appendChild(c);}
        });
        document.getElementById('trialSection').style.display=trc>0?'block':'none';
        document.getElementById('tvSection').style.display=tc>0?'block':'none';
        document.getElementById('multiSection').style.display=mc>0?'block':'none';`,
    );

    prepared = this.replaceFirst(
      prepared,
      /function selPkg\(id\)\{/,
      `function startTrial(id){
      if(trialStarting)return;
      var pkg=null;
      for(var i=0;i<pkgs.length;i++){if(pkgs[i].id===id){pkg=pkgs[i];break;}}
      if(!pkg)return;
      trialStarting=true;
      sst('Starting your free trial...','info');
      apiCall('POST','/api/portal/start-trial',{packageId:id,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo},function(err,res){
        if(err){trialStarting=false;sst(err.message||'Unable to start the free trial.','err');return;}
        if(res&&res.reconnect&&res.reconnect.username){conn(res.reconnect);return;}
        trialStarting=false;
        sst('Trial started. Reconnect to this WiFi if internet does not begin automatically.','ok');
      });
    }

    function selPkg(id){`,
    );

    return prepared;
  }

  prepareCompletionHtml(_html: string) {
    return `
$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)
$(if http-header == "Pragma")no-cache$(endif)
$(if http-header == "Expires")0$(endif)
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta http-equiv="refresh" content="0;url=http://connectivitycheck.gstatic.com/generate_204">
  <title></title>
  <style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}body{visibility:hidden}</style>
</head>
<body aria-hidden="true">
<script>
(function(){
  function finishTarget(){
    var ua=navigator.userAgent||'';
    if(/Windows/i.test(ua))return 'http://www.msftconnecttest.com/connecttest.txt';
    if(/iPhone|iPad|Macintosh/i.test(ua))return 'http://captive.apple.com/hotspot-detect.html';
    return 'http://connectivitycheck.gstatic.com/generate_204';
  }
  var target='$(link-redirect)';
  if(!target||target.indexOf('$(')===0||/\\.wifi(?:\\/|$)/i.test(target)||/\\/login(?:[/?]|$)/i.test(target))target=finishTarget();
  try{window.close();}catch(e){}
  setTimeout(function(){try{window.location.replace(target);}catch(e){window.location.href=target;}},0);
  setTimeout(function(){try{window.close();}catch(e){}},120);
})();
</script>
</body>
</html>
`;
  }

  private resolveProvisioningNasIp(selfReportedNasIp?: string, httpSourceIp?: string) {
    const reportedIp = this.normalizeIpv4(selfReportedNasIp);
    const observedIp = this.normalizeIpv4(httpSourceIp);

    if (reportedIp && !this.isPrivateOrReservedIpv4(reportedIp)) {
      return reportedIp;
    }

    return observedIp || reportedIp || '';
  }

  private normalizeIpv4(value?: string) {
    const normalized = value?.trim().replace(/^::ffff:/, '') ?? '';
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) &&
      normalized.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
      ? normalized
      : '';
  }

  private isPrivateOrReservedIpv4(ip: string) {
    const [a, b] = ip.split('.').map(Number);

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  private resolveSourceIp(request: any) {
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return (
      firstForwardedIp ||
      request.headers?.['x-real-ip'] ||
      request.ip ||
      request.socket?.remoteAddress ||
      ''
    ).replace(/^::ffff:/, '');
  }

  private replaceFirst(script: string, pattern: string | RegExp, replacement: string) {
    if (typeof pattern === 'string') {
      return script.includes(pattern) ? script.replace(pattern, replacement) : script;
    }

    return pattern.test(script) ? script.replace(pattern, replacement) : script;
  }
}
