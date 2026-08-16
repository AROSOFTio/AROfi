import { Injectable, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'

type MutableMikrotikController = MikrotikController & {
  prepareLoginHtml: (html: string) => string
}

const UI_MARKER = 'id="arofi-captive-v3"'

/**
 * Final captive-portal UX layer.
 *
 * Success has exactly one outcome: credentials are posted to RouterOS and the
 * captive browser disappears. This initializer must never add a Connected,
 * Disconnect, logout, resume, confirmation, or other post-auth customer page.
 * Returning devices with an active package are handled by the trusted
 * mac-cookie + activation-aware reconnect policy in RouterCaptiveFlowInitializer.
 */
@Injectable()
export class RouterCaptiveUiV3Initializer implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    const controller = this.moduleRef.get(MikrotikController, { strict: false }) as
      | MutableMikrotikController
      | undefined
    if (!controller || typeof controller.prepareLoginHtml !== 'function') return

    const originalLogin = controller.prepareLoginHtml.bind(controller)
    controller.prepareLoginHtml = (html: string) => this.applyCompactPortal(originalLogin(html))
  }

  private applyCompactPortal(input: string) {
    let html = input
    if (!html || html.includes(UI_MARKER)) return html

    html = html.replace(
      '<div id="loading" class="spin-wrap"><div class="spinner"></div><p>Loading packages...</p></div>',
      '<div id="loading" class="spin-wrap"><div class="wifi-loader" aria-hidden="true"><i></i><i></i><i></i><b></b></div><p>Loading packages...</p></div>',
    )

    // Let the customer see the voucher/payment controls while package data is
    // hydrating. This changes perceived speed only; authentication still waits
    // for the actual API/RADIUS result.
    html = html.replace('id="content" style="display:none"', 'id="content" style="display:block"')

    html = html.replace(
      '<div class="tv-voucher" id="tvVoucherBox">',
      '<div class="utility-row"><div class="tv-voucher" id="tvVoucherBox">',
    )
    html = html.replace(
      '      </div>\n      <div class="find-panel" id="findPanel">',
      '      </div>\n      </div>\n      <div class="find-panel" id="findPanel">',
    )
    html = html.replace('Connect voucher to a Smart TV', 'Smart TV')
    html = html.replace('Already bought? Find My Voucher', 'Already bought?')

    // Mobile Money remains in one sheet while the PIN/STK prompt is pending.
    // The moment COMPLETED + reconnect credentials arrive, conn() performs the
    // existing immediate native RouterOS POST and hides the document.
    html = html.replace(
      '<button class="btn" id="pbtn" onclick="pay()">Pay with Mobile Money</button>',
      '<button class="btn" id="pbtn" onclick="pay()">Pay &amp; Connect</button><div class="pay-inline" id="payInline"><span class="pay-wifi"><i></i><i></i><b></b></span><span id="payStateText"></span></div>',
    )
    html = html.replace(
      '    function pay(){',
      "    function setPayState(m,t){var p=document.getElementById('payInline'),x=document.getElementById('payStateText');if(!p||!x)return;x.textContent=m||'';p.className='pay-inline '+(t||'');p.style.display=m?'flex':'none';}\n\n    function pay(){",
    )
    html = html.replace(
      "      sst('Initiating payment...','info');",
      "      closeMsg();setPayState('Sending payment prompt...','wait');",
    )
    html = html.replace(
      "      if(!/^256\\d{9}$/.test(c)){sst('Enter a valid Mobile Money number.','err');return;}",
      "      if(!/^256\\d{9}$/.test(c)){setPayState('Enter a valid Mobile Money number.','err');return;}",
    )
    html = html.replace(
      "        if(!payMac){sst('Enter the Smart TV wireless MAC address before paying for this TV package.','err');return;}",
      "        if(!payMac){setPayState('Enter the Smart TV wireless MAC address before paying.','err');return;}",
    )
    html = html.replace(
      "        if(err){ sst(err.message||'Failed','err');b.disabled=false;return; }",
      "        if(err){ setPayState(err.message||'Payment request failed.','err');b.disabled=false;return; }",
    )
    html = html.replace(
      "        if(pmt.status==='FAILED'){ sst(pmt.statusMessage||'Failed','err');b.disabled=false;return; }",
      "        if(pmt.status==='FAILED'){ setPayState(pmt.statusMessage||'Payment request failed.','err');b.disabled=false;return; }",
    )
    html = html.replace(
      "      document.getElementById('pbtn').disabled=false;\n      document.getElementById('payOverlay').classList.add('on');",
      "      document.getElementById('pbtn').disabled=false;\n      setPayState('','');\n      document.getElementById('payOverlay').classList.add('on');",
    )
    html = html.replace(
      /if\(pmt\.activation&&pmt\.reconnect&&pmt\.reconnect\.username\)\{(?:closePay\(\);)?conn\(pmt\.reconnect\);return;\}\s*(?:closePay\(\);\s*)?sst\(selTv\?'[^']*':'[^']*','info'\);\s*poll\(pmt\.id,pmt\.statusToken\);/,
      "if(pmt.activation&&pmt.reconnect&&pmt.reconnect.username){conn(pmt.reconnect);return;} setPayState(selTv?'Approve the prompt on your phone. TV access will activate automatically.':'Approve the Mobile Money prompt on your phone.','wait'); poll(pmt.id,pmt.statusToken);",
    )

    html = html.replace(
      /    function poll\(id,tok\)\{.*?\n    \}\n\n    function rec\(\)\{/s,
      `    function poll(id,tok){
      var n=0,stopped=false;
      function stop(){stopped=true;}
      function check(){
        if(stopped)return;
        if(++n>900){stop();setPayState('Payment confirmation timed out. Tap Pay & Connect to check again.','err');document.getElementById('pbtn').disabled=false;return;}
        apiCall('POST','/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''),null,function(err,p){
          if(stopped)return;
          if(err){setTimeout(check,250);return;}
          if(p.activation){
            if(selTv){
              stop();document.getElementById('pbtn').disabled=false;
              var tvm=normMac(document.getElementById('tvmac').value);
              setPayState('TV '+tvm+' is active. Reconnect the TV to this WiFi.','ok');
              return;
            }
            if(p.reconnect&&p.reconnect.username){stop();conn(p.reconnect);return;}
          }
          if(p.status==='FAILED'||p.status==='CANCELLED'||p.status==='EXPIRED'){
            stop();setPayState(p.statusMessage||'Payment was not completed.','err');document.getElementById('pbtn').disabled=false;return;
          }
          setTimeout(check,120);
        });
      }
      check();
    }

    function rec(){`,
    )

    const css = `
<style id="arofi-captive-v3">
*{box-sizing:border-box}
body{background:#f6f8fb!important;color:#111827!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif!important;padding:10px 10px 22px!important}
.card{max-width:430px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:16px!important;padding:14px!important;box-shadow:0 3px 14px rgba(15,23,42,.06)!important}
.hdr{min-height:72px!important;justify-content:center!important}.wifi-icon{width:42px!important;height:42px!important;margin:0 0 2px!important;color:#10b981!important;animation:arofiWifiPulse 1.8s ease-in-out infinite!important}.wifi-icon svg{width:42px!important;height:42px!important}.title{font-size:14px!important;font-weight:800!important;letter-spacing:.045em!important;opacity:1!important;color:#2563eb!important;margin-top:0!important}
@keyframes arofiWifiPulse{0%,100%{opacity:.72;transform:scale(.97)}50%{opacity:1;transform:scale(1.035)}}
.spin-wrap{padding:7px 0 5px!important}.spinner{display:none!important}.wifi-loader{position:relative;width:34px;height:27px;margin:0 auto;color:#2563eb}.wifi-loader i{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);border:2.5px solid transparent;border-top-color:currentColor;border-radius:50%;animation:arofiArc 1.05s ease-in-out infinite}.wifi-loader i:nth-child(1){width:31px;height:31px}.wifi-loader i:nth-child(2){width:22px;height:22px;animation-delay:.12s}.wifi-loader i:nth-child(3){width:13px;height:13px;animation-delay:.24s}.wifi-loader b{position:absolute;left:50%;bottom:2px;width:5px;height:5px;border-radius:50%;background:currentColor;transform:translateX(-50%);animation:arofiDot 1.05s ease-in-out infinite .3s}@keyframes arofiArc{0%,100%{opacity:.18;transform:translateX(-50%) translateY(2px) scale(.94)}45%{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes arofiDot{0%,100%{opacity:.28}45%{opacity:1}}.spin-wrap p{margin-top:7px!important;font-size:12px!important;color:#64748b!important}
.quick-row{gap:7px!important;margin-top:10px!important}.quick-row input{background:#fff!important;border-color:#dbe1e8!important;border-radius:10px!important;padding:11px 12px!important;font-size:13px!important}.connect-btn{border-radius:10px!important;padding:11px 16px!important;font-size:13px!important;box-shadow:none!important}
.utility-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;margin-top:7px;align-items:start}.utility-row .tv-voucher,.utility-row .find-wrap{margin:0!important;min-width:0!important}.utility-row .tv-voucher{padding:0!important;border:0!important;background:transparent!important}.utility-row .tv-voucher label,.utility-row .find-link{width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.utility-row .tv-voucher input[type=checkbox]{width:14px!important;height:14px!important}.utility-row .tv-voucher.on{grid-column:1/-1!important}.utility-row .tv-voucher.on .tv-mac-wrap{margin-top:7px!important}.find-panel{margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}
.section-label{font-size:12px!important;font-weight:700!important;color:#475569!important;margin-top:14px!important}.section-sub{font-size:10px!important;margin-top:3px!important}.pkgs{gap:7px!important;margin-top:9px!important}.pkg{gap:8px!important;padding:9px 10px!important;border-color:#e5e7eb!important;border-radius:10px!important;box-shadow:none!important;transition:border-color .12s,transform .12s!important}.pkg:active{transform:scale(.992)}.pkg .pk-name{font-size:13px!important;color:#111827!important}.pkg .pk-dur{font-size:10.5px!important;margin-top:1px!important}.pkg .pk-price{font-size:12px!important}.pkg .pk-buy{border:0!important;border-radius:9px!important;padding:7px 12px!important;font-size:12px!important;box-shadow:none!important}.tv-section{margin-top:10px!important;padding:10px!important;border-color:#e5e7eb!important;background:#fff!important;border-radius:11px!important}.tv-section .pkgs{margin-top:8px!important}
.accept{margin-top:11px!important;padding:10px!important;border-color:#e5e7eb!important;border-radius:10px!important}.accept-label{font-size:11px!important;margin-bottom:7px!important}.accept-logos{gap:8px!important}.net{min-width:62px!important;border-radius:9px!important;padding:5px 9px!important;box-shadow:none!important}.support{margin-top:12px!important;padding-top:11px!important;gap:5px!important;font-size:10.5px!important}.wa-inline{margin-top:2px!important;border-radius:9px!important;padding:7px 11px!important;font-size:10.5px!important;box-shadow:none!important}.tech{margin-top:12px!important;font-size:9.5px!important}
.modal-overlay{background:rgba(15,23,42,.28)!important;backdrop-filter:none!important}.pay-box{max-width:390px!important;border-radius:14px!important;padding:16px!important;box-shadow:0 16px 40px rgba(15,23,42,.18)!important}.pay-box .pname{font-size:16px!important}.pay-box .psub{font-size:11.5px!important;margin-bottom:11px!important}.btn{padding:12px!important;border-radius:10px!important;font-size:13px!important}.pay-inline{display:none;align-items:center;gap:9px;margin-top:9px;padding:8px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:11px;font-weight:700}.pay-inline.ok{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.pay-inline.err{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.pay-wifi{position:relative;width:24px;height:18px;flex:0 0 24px;color:#2563eb}.pay-wifi i{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);border:2px solid transparent;border-top-color:currentColor;border-radius:50%;animation:arofiArc .9s ease-in-out infinite}.pay-wifi i:first-child{width:22px;height:22px}.pay-wifi i:nth-child(2){width:13px;height:13px;animation-delay:.15s}.pay-wifi b{position:absolute;width:4px;height:4px;border-radius:50%;background:currentColor;left:50%;bottom:1px;transform:translateX(-50%)}
.message-box{border-radius:12px!important;box-shadow:0 14px 38px rgba(15,23,42,.16)!important}.message-overlay{background:rgba(15,23,42,.22)!important}
@media(max-width:360px){body{padding:7px 7px 16px!important}.card{padding:11px!important}.utility-row{gap:5px}.utility-row .tv-voucher label,.utility-row .find-link{font-size:10px!important;padding:7px 5px!important}.pkg{grid-template-columns:minmax(0,1fr) auto auto!important;gap:5px!important}.pkg .pk-buy{padding:7px 9px!important}.quick-row input{min-width:0!important;padding-left:9px!important;padding-right:9px!important}.connect-btn{padding-left:12px!important;padding-right:12px!important}}
@media(prefers-reduced-motion:reduce){.wifi-icon,.wifi-loader i,.wifi-loader b,.pay-wifi i{animation:none!important}}
</style>`

    html = html.replace('</head>', `${css}</head>`)
    return html
  }
}
