import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common'
import { RoutersService } from './routers.service'

@Controller('mikrotik')
export class MikrotikAloginController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('alogin-html/:key')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getAloginHtml(@Param('key') key: string) {
    const existingHtml = await this.routersService.getMikrotikStatusHtmlByKey(key)
    if (!existingHtml) {
      throw new NotFoundException('Router alogin.html not found')
    }

    return this.buildInstantCompletionHtml()
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
}
