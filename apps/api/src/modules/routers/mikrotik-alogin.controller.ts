import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common'
import { RoutersService } from './routers.service'

@Controller('mikrotik')
export class MikrotikAloginController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('alogin-html/:key')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getAloginHtml(@Param('key') key: string) {
    // Reuse the existing key-scoped lookup so this public endpoint cannot be
    // used for arbitrary router keys. The returned status HTML is not needed;
    // a valid result confirms that this registration key belongs to a router.
    const existingHtml = await this.routersService.getMikrotikStatusHtmlByKey(key)
    if (!existingHtml) {
      throw new NotFoundException('Router alogin.html not found')
    }

    return this.buildInstantRedirectHtml()
  }

  private buildInstantRedirectHtml() {
    // MikroTik processes these directives before sending the response. A real
    // HTTP 302 removes the stock "You are logged in" waiting screen entirely.
    // The meta refresh and link are fallbacks for unusual captive webviews.
    return `$(if http-status == 302)AROFi connected$(endif)
$(if http-header == "Location")$(link-redirect)$(endif)
$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate$(endif)
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=$(link-redirect)">
  <title>Connected</title>
</head>
<body>
  <p>Connected. <a href="$(link-redirect)">Continue</a></p>
</body>
</html>
`
  }
}
