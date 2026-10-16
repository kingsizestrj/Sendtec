import { BadRequestException, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';

/**
 * Atualização pela tela. Quem executa é o serviço "updater" do docker-compose (tem acesso ao Docker);
 * a aplicação só lê o status e deixa um pedido numa pasta compartilhada.
 */
const DIR = process.env.UPDATES_DIR || '/updates';

async function readJson(file: string) {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

@Roles(Role.ADMIN)
@Controller('system/update')
export class SystemController {
  constructor(private audit: AuditService) {}

  @Get()
  async status() {
    const status = await readJson('status.json');
    const run = await readJson('run.json');
    const log = await fs.readFile(path.join(DIR, 'update.log'), 'utf8').catch(() => '');
    const pending = await fs
      .access(path.join(DIR, 'request'))
      .then(() => true)
      .catch(() => false);
    return { available: !!status, status, run, pending, log: log.split('\n').slice(-60).join('\n') };
  }

  @Post('check')
  async check() {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, 'check'), new Date().toISOString());
    return { ok: true };
  }

  @Post('apply')
  async apply(@CurrentUser() user: AuthUser) {
    const status = await readJson('status.json');
    if (!status) throw new BadRequestException('O serviço de atualização não está instalado neste servidor');
    if (!status.behind) throw new BadRequestException('O Sendtec já está na versão mais recente');
    await fs.writeFile(path.join(DIR, 'request'), JSON.stringify({ by: user.name, at: new Date().toISOString() }));
    await this.audit.log(user, 'Iniciou atualização do Sendtec', 'sistema', null, { de: status.current, para: status.latest });
    return { ok: true };
  }
}
