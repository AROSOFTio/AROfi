import { Injectable, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

/**
 * Final safety layer for the REAL customer portal served by RouterOS from
 * hotspot/login.html. It runs after the visual/package transforms and keeps
 * first-time captive clients from being trapped on "Loading packages..." when
 * the first API route, DNS/TLS, or a captive mini-browser stalls.
 *
 * The generated login.html already has HTTPS -> HTTP fallback. This layer makes
 * the initial GET /api/portal/context stricter: 4s per transport, exactly-once
 * callback semantics, then an 8.5s UI watchdog with an explicit Retry button.
 * Payment/voucher/activation requests keep their existing behavior.
 */
@Injectable()
export class CaptivePortalResilienceInitializer implements OnModuleInit {
  constructor(private readonly mikrotikService: MikrotikService) {}

  onModuleInit() {
    const service = this.mikrotikService as MikrotikService & {
      buildLoginHtml: (registrationKey: string, portalBaseUrl?: string | null) => string
    }

    const original = service.buildLoginHtml.bind(service)
    service.buildLoginHtml = (registrationKey: string, portalBaseUrl?: string | null) =>
      this.applyResilience(original(registrationKey, portalBaseUrl))
  }

  private applyResilience(html: string) {
    if (html.includes('id="arofi-local-resilience-v2"')) return html

    const routerHeaders = `$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)
$(if http-header == "Pragma")no-cache$(endif)
$(if http-header == "Expires")0$(endif)`

    const meta = `<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="arofi-local-portal-release" content="20260905-v2">`

    const style = `<style id="arofi-local-resilience-v2">
      /* Keep the top calm and premium on the router-hosted captive page too. */
      .premium-hero{background:#071A49!important}
      .premium-wifi span{animation:none!important;opacity:.58!important}
      .premium-wifi i{box-shadow:none!important}
      .arofi-load-fail{padding:22px 14px;text-align:center}
      .arofi-load-fail strong{display:block;color:#0f172a;font-size:14px;margin-bottom:5px}
      .arofi-load-fail span{display:block;color:#64748b;font-size:11px;line-height:1.45;margin:0 auto 12px;max-width:300px}
      .arofi-load-retry{appearance:none;border:0;border-radius:10px;background:#0964FA;color:#fff;font-size:12px;font-weight:800;padding:9px 18px;cursor:pointer}
    </style>`

    const script = `<script id="arofi-local-resilience-script-v2">
    (function(){
      var CONTEXT_TIMEOUT=4000;
      var WATCHDOG_MS=8500;
      var baseApiCall=typeof apiCall==='function'?apiCall:null;

      function contextRequest(base,path,cb){
        var done=false,x=new XMLHttpRequest();
        function finish(err,data){if(done)return;done=true;try{x.abort();}catch(e){}cb(err,data);}
        try{
          x.open('GET',base+path,true);
          x.timeout=CONTEXT_TIMEOUT;
          x.onload=function(){
            var raw=x.responseText||'',data=null;
            try{data=raw?JSON.parse(raw):{};}catch(e){}
            if(x.status>=200&&x.status<300){finish(null,data||{});return;}
            var msg=data&&data.message;
            if(Object.prototype.toString.call(msg)==='[object Array]')msg=msg.join('. ');
            if(!msg)msg='Portal context failed (HTTP '+x.status+').';
            var err=new Error(String(msg));err.status=x.status;finish(err);
          };
          x.onerror=function(){finish(new Error('Portal network request failed.'));};
          x.ontimeout=function(){finish(new Error('Portal request timed out.'));};
          x.send(null);
        }catch(e){finish(e instanceof Error?e:new Error('Portal request failed.'));}
      }

      if(baseApiCall){
        apiCall=function(method,path,data,cb){
          var isContext=String(method||'GET').toUpperCase()==='GET'&&String(path||'').indexOf('/api/portal/context')===0;
          if(!isContext){baseApiCall(method,path,data,cb);return;}
          contextRequest(API,path,function(firstErr,firstData){
            if(!firstErr){cb(null,firstData);return;}
            contextRequest(APIFB,path,function(secondErr,secondData){
              if(!secondErr){cb(null,secondData);return;}
              cb(secondErr||firstErr||new Error('Unable to load WiFi packages.'));
            });
          });
        };
      }

      function loadingVisible(){
        var el=document.getElementById('loading');
        if(!el)return false;
        var s=window.getComputedStyle?window.getComputedStyle(el):null;
        return el.style.display!=='none'&&(!s||s.display!=='none');
      }

      function failOpen(){
        if(!loadingVisible())return;
        var loading=document.getElementById('loading');
        if(!loading)return;
        loading.className='arofi-load-fail';
        loading.innerHTML='<strong>Packages could not load</strong><span>Keep this WiFi connected and try again. The portal will never stay stuck on loading.</span><button type="button" class="arofi-load-retry" id="arofiLoadRetry">Retry</button>';
        var b=document.getElementById('arofiLoadRetry');
        if(b)b.onclick=function(){
          var q=window.location.search||'';
          var sep=q?'&':'?';
          window.location.replace(window.location.pathname+q+sep+'arofiReload='+Date.now());
        };
      }

      function arm(){setTimeout(failOpen,WATCHDOG_MS);}
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm);else arm();
    })();
    </script>`

    let next = html.replace(/<!doctype html>/i, `${routerHeaders}\n<!-- AROFi local portal 20260905-v2 -->\n<!doctype html>`)
    next = next.replace('<head>', `<head>\n  ${meta}`)
    next = next.replace('</head>', `${style}</head>`)
    next = next.replace('</body>', `${script}</body>`)
    return next
  }
}
