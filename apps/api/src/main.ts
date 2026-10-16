import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';

async function ensureAdmin(prisma: PrismaService) {
  if (await prisma.user.count()) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@sendtec.local').toLowerCase();
  // sem ADMIN_PASSWORD, gera uma senha aleatória (nunca uma senha padrão conhecida)
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  await prisma.user.create({ data: { name: 'Administrador', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) } });
  Logger.warn(
    process.env.ADMIN_PASSWORD
      ? `Usuário administrador criado: ${email} — troque a senha no primeiro acesso`
      : `Usuário administrador criado: ${email} / senha: ${password} — troque a senha no primeiro acesso`,
    'Bootstrap',
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); // navegador não "adivinha" o tipo de arquivos enviados
    res.setHeader('X-Frame-Options', 'DENY'); // impede abrir o painel dentro de iframe de outro site
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useBodyParser('json', { limit: '5mb' });
  app.enableShutdownHooks();
  await ensureAdmin(app.get(PrismaService));
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  Logger.log(`Sendtec rodando em http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
