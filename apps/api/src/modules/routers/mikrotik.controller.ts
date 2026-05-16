import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
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
}
