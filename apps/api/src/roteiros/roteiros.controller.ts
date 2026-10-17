import { Controller, Get } from '@nestjs/common';
import { RoteirosService } from './roteiros.service';

@Controller('roteiros')
export class RoteirosController {
  constructor(private roteiros: RoteirosService) {}

  /** Para a tela: integração ligada? e a validade padrão (aaaa-mm-dd). */
  @Get('defaults')
  async defaults() {
    const iso = await this.roteiros.defaultValidity();
    return { enabled: await this.roteiros.enabled(), validUntil: iso.slice(0, 10) };
  }
}
