import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common'
import { RoutersService } from './routers.service'

@Controller('mikrotik')
export class MikrotikAloginController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('alogin-html/:key')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getAloginHtml(@Param('key') key: string) {
    await this.assertRouterKey(key)
    return this.buildInstantCompletionHtml()
  }

  @Get('logout-html/:key')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getLogoutHtml(@Param('key') key: string) {
    await this.assertRouterKey(key)
    return this.buildLogoutHtml()
  }

  private async assertRouterKey(key: string) {
    // Reuse the existing key-scoped lookup so these public HTML endpoints
    // cannot be used for arbitrary/unknown router keys.
    const existingHtml = await this.routersService.getMikrotikStatusHtmlByKey(key)
    if (!existingHtml) {
      throw new NotFoundException('Router captive page not found')
    }
  }

  private buildInstantCompletionHtml() {
    return `$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)
$(if http-header == "Pragma")no-cache$(endif)
$(if http-header == "Expires")0$(endif)
<!doctype html>
<html lang="en">
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
`
  }

  private buildLogoutHtml() {
    // MikroTik renders this file only AFTER it has processed /logout. Keep the
    // purchased activation in AROFi, but return the browser to /login with a
    // one-request marker so the portal respects the deliberate disconnect and
    // does not instantly auto-login again. A later ordinary Wi-Fi reconnect has
    // no marker and can restore the still-active package automatically.
    return `$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)
$(if http-header == "Pragma")no-cache$(endif)
$(if http-header == "Expires")0$(endif)
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta http-equiv="refresh" content="0;url=$(link-login-only)?loggedout=1">
  <title>Disconnected</title>
  <style>html,body{margin:0;width:100%;height:100%;background:#f6f8fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827}body{display:flex;align-items:center;justify-content:center;padding:18px}.box{width:100%;max-width:360px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;text-align:center}.box b{display:block;font-size:16px;margin-bottom:5px}.box span{font-size:12px;color:#64748b}</style>
</head>
<body>
  <div class="box"><b>Disconnected</b><span>Your active package is saved. Reconnect when you are ready.</span></div>
<script>
(function(){
  var target='$(link-login-only)?loggedout=1';
  setTimeout(function(){try{window.location.replace(target);}catch(e){window.location.href=target;}},0);
})();
</script>
</body>
</html>`
  }
}
