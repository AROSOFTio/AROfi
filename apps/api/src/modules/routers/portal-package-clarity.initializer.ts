import { Injectable, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

/**
 * Final visual pass for RouterOS-hosted hotspot/login.html.
 *
 * The compact captive shell intentionally stays short, but package cards are a
 * purchase decision and must remain readable at arm's length on a phone. This
 * wrapper runs after the premium captive initializer and only adjusts package
 * hierarchy/decorations; it does not change voucher, payment, roaming, RADIUS,
 * or reconnect behaviour.
 */
@Injectable()
export class PortalPackageClarityInitializer implements OnModuleInit {
  constructor(private readonly mikrotikService: MikrotikService) {}

  onModuleInit() {
    const service = this.mikrotikService as unknown as {
      buildLoginHtml: (registrationKey: string, portalBaseUrl?: string | null) => string
    }
    const original = service.buildLoginHtml.bind(service)
    service.buildLoginHtml = (registrationKey: string, portalBaseUrl?: string | null) =>
      this.applyPackageClarity(original(registrationKey, portalBaseUrl))
  }

  private applyPackageClarity(html: string) {
    if (html.includes('id="arofi-package-clarity-v3"')) return html

    const style = `<style id="arofi-package-clarity-v3">
      /* Readable, purchase-focused plan cards. Keep the portal compact, but do
         not shrink the information a customer needs to choose a package. */
      .premium-card-title{font-size:17px!important;line-height:1.2!important;margin-bottom:11px!important}
      .section-label{font-size:17px!important;line-height:1.2!important;margin-bottom:3px!important}
      .section-sub{font-size:12px!important;line-height:1.35!important;margin-bottom:11px!important}
      .pkgs{gap:10px!important;margin-top:10px!important}
      .pkg{position:relative!important;min-height:154px!important;padding:13px!important;gap:6px!important;border-radius:17px!important;border:1px solid #d8e2ef!important;background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)!important;box-shadow:0 6px 18px rgba(7,26,73,.055)!important;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease!important}
      .pkg:active{transform:scale(.985)!important;border-color:#9cc7ff!important;box-shadow:0 4px 12px rgba(9,100,250,.12)!important}
      .pkg-head{display:flex!important;align-items:center!important;gap:9px!important;min-width:0!important}
      .pkg-visual-icon{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 38px!important;width:38px!important;height:38px!important;border-radius:50%!important;background:#edf6ff!important;color:#0964FA!important;border:1px solid #d8ebff!important}
      .pkg-visual-icon svg{width:20px!important;height:20px!important;stroke:currentColor!important;fill:none!important;stroke-width:2!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .pkg-head-text{display:block!important;min-width:0!important;flex:1!important}
      .pkg .pk-name{display:block!important;font-size:15.5px!important;line-height:1.18!important;font-weight:900!important;color:#0b1739!important;white-space:normal!important;overflow:visible!important;-webkit-line-clamp:unset!important}
      .pkg .pk-dur{display:block!important;margin-top:3px!important;font-size:11.5px!important;line-height:1.25!important;font-weight:600!important;color:#64748b!important}
      .pkg .pk-price{display:block!important;font-size:21px!important;line-height:1.05!important;font-weight:950!important;letter-spacing:-.02em!important;color:#0759e8!important;margin:4px 0 3px!important}
      .pkg .pk-buy{display:flex!important;align-items:center!important;justify-content:center!important;min-height:34px!important;margin-top:auto!important;border-radius:10px!important;padding:8px 10px!important;font-size:12.5px!important;line-height:1!important;font-weight:850!important;letter-spacing:.005em!important;color:#fff!important;box-shadow:0 6px 13px rgba(9,100,250,.18)!important}
      .premium-tab{font-size:10.5px!important}
      .accept-label strong{font-size:16px!important}.accept-label small{font-size:11px!important}
      @media(max-width:720px){
        .pkgs{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
        .pkg{min-height:148px!important;padding:11px!important;border-radius:15px!important}
        .pkg-head{gap:7px!important}.pkg-visual-icon{flex-basis:34px!important;width:34px!important;height:34px!important}.pkg-visual-icon svg{width:18px!important;height:18px!important}
        .pkg .pk-name{font-size:14.5px!important}.pkg .pk-dur{font-size:10.75px!important}.pkg .pk-price{font-size:19px!important}.pkg .pk-buy{min-height:33px!important;font-size:12px!important;padding:8px!important}
        .premium-card-title,.section-label{font-size:15.5px!important}.section-sub{font-size:11px!important}.premium-tab{font-size:10px!important}
      }
      @media(max-width:390px){
        .pkgs{gap:6px!important}.pkg{min-height:143px!important;padding:9px!important}
        .pkg-head{gap:6px!important}.pkg-visual-icon{flex-basis:31px!important;width:31px!important;height:31px!important}.pkg-visual-icon svg{width:16px!important;height:16px!important}
        .pkg .pk-name{font-size:13.5px!important}.pkg .pk-dur{font-size:10px!important}.pkg .pk-price{font-size:18px!important}.pkg .pk-buy{font-size:11.5px!important}
      }
    </style>`

    const script = `<script id="arofi-package-clarity-script-v3">
      (function(){
        var ICONS={
          clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path></svg>',
          multi:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="9" rx="2"></rect><path d="M6 18h5M8.5 14v4"></path><rect x="16" y="8" width="6" height="11" rx="1.5"></rect></svg>',
          tv:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="14" rx="2"></rect><path d="M8 22h8M12 18v4"></path></svg>'
        };
        function kind(el){
          var p=el.parentNode;
          while(p&&p!==document.body){
            var id=p.id||'';
            if(id==='premium-tv'||id==='tvSection'||id==='tvList')return 'tv';
            if(id==='premium-multi'||id==='multiSection'||id==='multiList')return 'multi';
            p=p.parentNode;
          }
          return 'clock';
        }
        function decorate(el){
          if(!el||el.getAttribute('data-arofi-clarity')==='1')return;
          var first=null,i;
          for(i=0;i<el.children.length;i++){
            if(el.children[i].tagName&&el.children[i].tagName.toLowerCase()==='span'){first=el.children[i];break;}
          }
          if(!first)return;
          var head=document.createElement('div');head.className='pkg-head';
          var icon=document.createElement('span');icon.className='pkg-visual-icon';icon.innerHTML=ICONS[kind(el)]||ICONS.clock;
          var text=document.createElement('span');text.className='pkg-head-text';
          while(first.firstChild)text.appendChild(first.firstChild);
          head.appendChild(icon);head.appendChild(text);
          el.replaceChild(head,first);el.setAttribute('data-arofi-clarity','1');
        }
        function scan(){var items=document.getElementsByClassName('pkg');for(var i=0;i<items.length;i++)decorate(items[i]);}
        function boot(){scan();if(window.MutationObserver){var o=new MutationObserver(scan);o.observe(document.body,{childList:true,subtree:true});}else{window.setInterval(scan,1200);}}
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
      })();
    </script>`

    let next = html.replace('</head>', `${style}</head>`)
    next = next.replace('</body>', `${script}</body>`)
    return next
  }
}
