import { Injectable, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

/**
 * The customer captive popup is served by RouterOS from hotspot/login.html,
 * not by Next.js. Keep all existing voucher/payment/reconnect JavaScript and
 * upgrade only the generated shell so captive browsers see the same approved
 * AROFi experience as /portal.
 */
@Injectable()
export class PremiumCaptivePortalInitializer implements OnModuleInit {
  constructor(private readonly mikrotikService: MikrotikService) {}

  onModuleInit() {
    const service = this.mikrotikService as MikrotikService & {
      buildLoginHtml: (registrationKey: string, portalBaseUrl?: string | null) => string
    }
    const original = service.buildLoginHtml.bind(service)
    service.buildLoginHtml = (registrationKey: string, portalBaseUrl?: string | null) =>
      this.applyPremiumPortal(original(registrationKey, portalBaseUrl))
  }

  private applyPremiumPortal(html: string) {
    if (html.includes('id="arofi-premium-captive"')) return html

    const style = `<style id="arofi-premium-captive">
      :root{--navy:#071A49;--blue:#0964FA;--cyan:#00C4EB;--ink:#0b1739;--muted:#64748b}
      body{background:#f3f7fc!important;color:var(--ink)!important;padding:20px 12px 36px!important}
      .card{max-width:880px!important;padding:0!important;overflow:hidden;background:#fff!important;border:0!important;border-radius:30px!important;box-shadow:0 24px 70px rgba(7,26,73,.14)!important}
      .hdr{display:none!important}.premium-hero{position:relative;overflow:hidden;min-height:235px;padding:24px 28px 32px;color:#fff;background:radial-gradient(circle at 82% 15%,rgba(0,196,235,.28),transparent 32%),linear-gradient(130deg,#020b26 0%,#071A49 58%,#0a37a3 100%)}
      .premium-hero:after{content:"";position:absolute;width:220px;height:220px;border:1px solid rgba(103,232,249,.19);border-radius:50%;right:-48px;top:50px}
      .premium-brand{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.premium-logo{display:block;max-width:220px;height:52px;object-fit:contain;object-position:left center}
      .premium-lang{display:flex;gap:7px;align-items:center;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700;background:rgba(255,255,255,.05)}
      .premium-copy{position:relative;z-index:2;margin-top:36px;max-width:490px}.premium-copy h1{font-size:38px;line-height:1.05;margin:0;font-weight:900;letter-spacing:-.03em}.premium-copy p{margin:9px 0 0;color:#c7d9ff;font-size:14px}.premium-copy small{display:block;margin-top:10px;color:#91b7ff;font-weight:650}
      .premium-router{position:absolute;right:48px;bottom:30px;width:156px;height:58px;border-radius:28px;background:linear-gradient(#1676ff,#092467);border:1px solid rgba(147,197,253,.6);box-shadow:0 0 30px rgba(9,100,250,.5)}.premium-router:before{content:"⌁";position:absolute;left:42px;top:-95px;font-size:105px;line-height:1;color:#67e8f9;transform:rotate(90deg);text-shadow:0 0 20px rgba(0,196,235,.5)}.premium-router:after{content:"•••";position:absolute;left:55px;bottom:7px;color:#67e8f9;letter-spacing:6px;font-size:17px}
      .premium-tabs{display:flex;overflow-x:auto;white-space:nowrap;border-bottom:1px solid #e2e8f0;background:#fff;padding:0 8px}.premium-tab{position:relative;min-width:102px;flex:1;border:0;background:transparent;padding:17px 9px 15px;color:#64748b;font-size:11px;font-weight:750;cursor:pointer}.premium-tab.on{color:var(--blue)}.premium-tab.on:after{content:"";position:absolute;left:20%;right:20%;height:3px;bottom:0;border-radius:5px;background:var(--blue)}
      #loading{padding:36px 0!important;background:#f8fbff}.spin-wrap .spinner{border-color:#bfdbfe!important;border-top-color:var(--blue)!important}
      #content{background:#f8fbff;padding:18px!important}.premium-panel{display:none}.premium-panel.on{display:block}.premium-card{background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 6px 20px rgba(7,26,73,.04);margin-bottom:14px}.premium-card-title{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:900;color:var(--ink);margin-bottom:14px}.premium-card-title i{font-style:normal;color:var(--blue)}
      .quick-row{margin:0!important;display:grid!important;grid-template-columns:1fr auto!important;gap:10px!important}.quick-row input{border:1px solid #d9e2ef!important;border-radius:16px!important;background:#fff!important;padding:13px 15px!important}.connect-btn,.btn{border-radius:16px!important;background:linear-gradient(90deg,#0964FA,#0646e6)!important;padding:13px 22px!important;box-shadow:0 10px 24px rgba(9,100,250,.18)!important}.secure-note{display:flex;align-items:center;gap:7px;margin-top:12px;font-size:11px;color:#64748b;font-weight:600}
      .section-label{text-align:left!important;font-size:19px!important;font-weight:900!important;color:var(--ink)!important;margin:5px 0 3px!important}.section-sub{text-align:left!important;margin:0 0 15px!important;max-width:none!important}.pkgs{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin-top:14px!important}.pkg{display:flex!important;min-height:150px!important;flex-direction:column!important;align-items:stretch!important;gap:6px!important;padding:15px!important;border-radius:18px!important;border:1px solid #dfe7f2!important;box-shadow:0 4px 16px rgba(7,26,73,.04)!important}.pkg .pk-name{font-size:15px!important;color:var(--ink)!important}.pkg .pk-dur{font-size:11px!important}.pkg .pk-price{font-size:18px!important;color:#0646e6!important;margin:2px 0 5px}.pkg .pk-buy{margin-top:auto!important;text-align:center;border:0!important;border-radius:11px!important;background:linear-gradient(90deg,#0964FA,#0646e6)!important;padding:9px!important}
      .accept{margin:14px 0!important;border:1px solid #e2e8f0!important;border-radius:22px!important;background:#fff!important;padding:18px!important;text-align:left!important}.accept-label{margin:0 0 12px!important}.accept-label strong{display:block;font-size:18px;color:var(--ink)}.accept-label small{display:block;margin-top:3px;font-weight:500;color:#64748b}.accept-logos{justify-content:flex-start!important}.net{min-width:130px!important;padding:10px 16px!important}.net-airtel{background:#fff1f2!important}
      .find-wrap{display:none!important}.find-panel{display:block!important;margin:0!important;border:0!important;padding:0!important}.tv-voucher{margin:0 0 14px!important;border-radius:18px!important}.tv-section{display:block;margin:0!important;border:0!important;background:transparent!important;padding:0!important}.tv-section .section-label{margin-top:0!important}.tv-section .pkgs{margin-top:14px!important}#multiSection{display:block!important}
      .member-card,.promo-card{background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:26px;text-align:center}.member-card h2,.promo-card h2{font-size:20px;margin:0 0 7px}.member-card p,.promo-card p{font-size:13px;color:#64748b;line-height:1.55;margin:0 auto 16px;max-width:450px}.member-card a{display:inline-block;border-radius:14px;background:linear-gradient(90deg,#0964FA,#0646e6);padding:12px 18px;color:white;text-decoration:none;font-size:13px;font-weight:850}
      .support{display:none;margin:16px 0 0!important;border:1px solid #e2e8f0!important;border-radius:24px!important;background:#fff!important;padding:20px!important}.support[style*="flex"]{display:flex!important}.support-phone{color:var(--blue)!important}.tech{margin:16px auto 0!important;color:#64748b!important}.wa-inline{box-shadow:none!important}
      .pay-box{border-radius:22px!important}.message-box{border-radius:20px!important}
      @media(max-width:720px){.premium-router{display:none}.premium-copy h1{font-size:31px}.premium-hero{min-height:225px}.pkgs{grid-template-columns:repeat(2,minmax(0,1fr))!important}.premium-logo{max-width:180px;height:46px}}
      @media(max-width:470px){body{padding:0!important}.card{border-radius:0!important;min-height:100vh}.premium-hero{padding:20px 18px 27px;min-height:220px}.premium-logo{max-width:156px;height:42px}.premium-lang{padding:7px 10px}.premium-copy{margin-top:34px}.premium-copy h1{font-size:30px}#content{padding:13px!important}.premium-card{padding:16px;border-radius:20px}.quick-row{grid-template-columns:1fr!important}.connect-btn{width:100%}.pkgs{grid-template-columns:1fr!important}.premium-tab{min-width:92px}.net{min-width:105px!important}}
    </style>`

    const hero = `<div class="premium-hero">
      <div class="premium-brand"><img id="premiumLogo" class="premium-logo" src="https://arofi.net/brand/arofi-logo-gradient.webp" alt="AROFi"><div class="premium-lang">◎ English⌄</div></div>
      <div class="premium-copy"><h1>Connect to Wi-Fi</h1><p>✓ Fast, secure internet access</p><small id="premiumTenant">AROFi Wi-Fi</small></div><div class="premium-router" aria-hidden="true"></div>
    </div>
    <div class="premium-tabs" id="premiumTabs">
      <button class="premium-tab on" data-tab="voucher">▣ Voucher</button><button class="premium-tab" data-tab="member">● Member</button><button class="premium-tab" data-tab="multi">▣ Multi-Device</button><button class="premium-tab" data-tab="tv">▣ TV</button><button class="premium-tab" data-tab="recover">⌕ Find My Voucher</button><button class="premium-tab" data-tab="promo">◇ Promo</button>
    </div>`

    const script = `<script id="arofi-premium-captive-script">
      (function(){
        function move(el,p){if(el&&p)p.appendChild(el)}
        function panel(id){var p=document.createElement('section');p.id='premium-'+id;p.className='premium-panel'+(id==='voucher'?' on':'');return p}
        function card(title){var c=document.createElement('div');c.className='premium-card';if(title)c.innerHTML='<div class="premium-card-title"><i>✦</i>'+title+'</div>';return c}
        function init(){
          var content=document.getElementById('content');if(!content||document.getElementById('premium-voucher'))return;
          var voucher=panel('voucher'),member=panel('member'),multi=panel('multi'),tv=panel('tv'),recover=panel('recover'),promo=panel('promo');
          var voucherCard=card('Have a voucher?');move(document.querySelector('.quick-row'),voucherCard);var secure=document.createElement('div');secure.className='secure-note';secure.textContent='🔒 Secure & encrypted connection';voucherCard.appendChild(secure);voucher.appendChild(voucherCard);
          var quick=document.getElementById('acceptBox');if(quick){var l=quick.querySelector('.accept-label');if(l)l.innerHTML='<strong>Quick Pay</strong><small>Pay instantly with Mobile Money</small>';move(quick,voucher)}
          var plans=card('Choose Your Plan');var standardLabel=content.querySelector(':scope > .section-label');if(standardLabel)standardLabel.remove();move(document.getElementById('plist'),plans);voucher.appendChild(plans);
          var multiInner=document.getElementById('multiSection');move(multiInner,multi);
          var tvVoucher=document.getElementById('tvVoucherBox');move(tvVoucher,tv);move(document.getElementById('tvSection'),tv);
          var find=card('Find My Voucher');move(document.getElementById('findPanel'),find);var fp=find.querySelector('.find-panel');if(fp)fp.classList.add('on');recover.appendChild(find);
          member.innerHTML='<div class="member-card"><h2>Member Access</h2><p>Already bought access? Use your payment or voucher phone number to view and reconnect your active package.</p><a id="premiumMemberLink" href="https://arofi.net/portal?tab=member">Open Member Access →</a></div>';
          promo.innerHTML='<div class="promo-card"><h2>Promotions</h2><p>No active promotion is published for this Wi-Fi right now. AROFi never invents offers that the operator has not configured.</p></div>';
          var support=document.getElementById('support');content.insertBefore(voucher,content.firstChild);content.insertBefore(member,support);content.insertBefore(multi,support);content.insertBefore(tv,support);content.insertBefore(recover,support);content.insertBefore(promo,support);
          var link=document.getElementById('premiumMemberLink');if(link)link.href='https://arofi.net/portal?tab=member&mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&link-login='+encodeURIComponent(lo);
          var tabs=document.querySelectorAll('.premium-tab');for(var i=0;i<tabs.length;i++)tabs[i].onclick=function(){var id=this.getAttribute('data-tab');for(var j=0;j<tabs.length;j++)tabs[j].classList.toggle('on',tabs[j]===this);var ps=document.querySelectorAll('.premium-panel');for(var k=0;k<ps.length;k++)ps[k].classList.toggle('on',ps[k].id==='premium-'+id)};
          var findWrap=document.querySelector('.find-wrap');if(findWrap)findWrap.style.display='none';
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
      })();
    </script>`

    let next = html.replace('</head>', `${style}</head>`)
    next = next.replace('<div class="card">', `<div class="card">${hero}`)
    next = next.replace(
      "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';",
      "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';var _pt=document.getElementById('premiumTenant');if(_pt&&d.tenant)_pt.textContent=d.tenant.name||'AROFi Wi-Fi';var _pl=document.getElementById('premiumLogo');if(_pl&&d.tenant&&d.tenant.logoUrl){_pl.src=d.tenant.logoUrl;_pl.onerror=function(){this.onerror=null;this.src='https://arofi.net/brand/arofi-logo-gradient.webp';};}",
    )
    return next.replace('</body>', `${script}</body>`)
  }
}
