import { Injectable, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'

type MutableMikrotikController = MikrotikController & {
  prepareLoginHtml: (html: string) => string
}

const ROAM_MARKER = 'arofi-cross-ap-instant-handoff-v1'
const ROAM_STORAGE_KEY = 'arofi.cross_ap.credential.v1'
const ROAM_ATTEMPT_PREFIX = 'arofi.cross_ap.attempt.v1:'

/**
 * Makes an already-paid customer follow the same AROFi business from AP A to
 * AP Z without entering the voucher again.
 *
 * All tenant routers serve the same business-local `.wifi` hostname, so the
 * browser has one origin even when the physical AP/router/SSID names differ.
 * We remember only the already-issued RADIUS reconnect credential on that
 * local origin and immediately POST it to the CURRENT RouterOS `link-login`
 * endpoint when the customer lands on another AP.
 *
 * RADIUS remains authoritative: expired credentials are rejected, another
 * tenant is rejected, and the authorization policy performs the same-business
 * AP handoff/rebind when a phone presents a different private MAC on AP Z.
 */
@Injectable()
export class CrossApInstantHandoffInitializer implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    const controller = this.moduleRef.get(MikrotikController, { strict: false }) as
      | MutableMikrotikController
      | undefined

    if (!controller || typeof controller.prepareLoginHtml !== 'function') {
      return
    }

    const original = controller.prepareLoginHtml.bind(controller)
    controller.prepareLoginHtml = (html: string) => this.applyInstantHandoff(original(html))
  }

  private applyInstantHandoff(html: string) {
    if (html.includes(ROAM_MARKER)) {
      return html
    }

    // Every successful voucher/payment/trial reconnect already passes through
    // conn(rc). Store that credential before the existing immediate RouterOS
    // POST so another AP can reuse it without another API round-trip.
    let prepared = html.replace(
      'function conn(rc){',
      `function conn(rc){try{if(rc&&rc.username){localStorage.setItem('${ROAM_STORAGE_KEY}',JSON.stringify({u:rc.username,p:rc.password||rc.username,s:Date.now()}));sessionStorage.removeItem('${ROAM_ATTEMPT_PREFIX}'+(lo||'local'));}}catch(_roamStoreErr){}`,
    )

    const autoHandoff = `
<script id="${ROAM_MARKER}">
(function(){
  var storageKey='${ROAM_STORAGE_KEY}';
  var lo='$(link-login-only)'||'';
  var routerError='$(error)'||'';
  if(!lo||lo.indexOf('$(')===0)return;

  // A rejected/expired stored login gets exactly one attempt, then is removed
  // so the normal package/voucher portal remains immediately usable.
  if(routerError&&routerError.indexOf('$(')!==0&&routerError.trim()){
    try{localStorage.removeItem(storageKey);sessionStorage.removeItem('${ROAM_ATTEMPT_PREFIX}'+lo);}catch(_clearErr){}
    return;
  }

  var remembered=null;
  try{
    var raw=localStorage.getItem(storageKey);
    if(raw)remembered=JSON.parse(raw);
  }catch(_readErr){return;}
  if(!remembered||!remembered.u)return;

  var attemptKey='${ROAM_ATTEMPT_PREFIX}'+lo;
  try{
    var last=Number(sessionStorage.getItem(attemptKey)||0);
    if(last&&Date.now()-last<8000)return;
    sessionStorage.setItem(attemptKey,String(Date.now()));
  }catch(_attemptErr){}

  function add(form,name,value){
    var input=document.createElement('input');
    input.type='hidden';input.name=name;input.value=value||'';form.appendChild(input);
  }

  var form=document.createElement('form');
  form.method='post';form.action=lo;form.style.display='none';
  add(form,'username',remembered.u);
  add(form,'password',remembered.p||remembered.u);
  add(form,'dst',typeof finishTarget==='function'?finishTarget():'http://connectivitycheck.gstatic.com/generate_204');
  add(form,'popup','false');
  document.body.appendChild(form);
  document.documentElement.style.visibility='hidden';
  form.submit();
})();
</script>`

    if (prepared.includes('</body>')) {
      prepared = prepared.replace('</body>', `${autoHandoff}</body>`)
    } else {
      prepared += autoHandoff
    }

    return prepared
  }
}
